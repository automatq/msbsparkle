/**
 * Time-off integration tests against the local database (seeded). Skipped when DATABASE_URL is
 * unset. Covers the rule that matters: only APPROVED time off keeps a cleaner off the schedule,
 * and admins can only manage cleaners in their own organization and regions.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requestTimeOff } from "@/modules/cleaner/service";
import { cleanerFixtures } from "@/modules/cleaner/test-fixtures";
import { prisma } from "@/modules/db/client";
import { addLocalDays, dateColumnToLocalDate, todayIn } from "@/modules/shared/dates";
import { assignCleaner } from "./assignment";
import { suggestCleaners } from "./dispatch";
import {
  addTimeOff,
  cleanerTimeOff,
  decideTimeOff,
  pendingTimeOff,
  removeTimeOff,
  timeOffConflicts,
  timeOffDays,
  timeOffRange,
  type AdminScope,
} from "./time-off";

const enabled = !!process.env.DATABASE_URL;
const fx = cleanerFixtures(`toff${Date.now().toString(36)}`, 9000);
const SYSTEM = { type: "SYSTEM" as const };

async function scopes(cleaner: { organizationId: string; homeRegionId: string }) {
  const superAdmin: AdminScope = {
    orgId: cleaner.organizationId,
    regionIds: [],
    isSuperAdmin: true,
    userId: "test-admin",
  };
  const otherRegion = await prisma.region.findFirstOrThrow({
    where: { organizationId: cleaner.organizationId, id: { not: cleaner.homeRegionId } },
  });
  return {
    superAdmin,
    homeRegionAdmin: { ...superAdmin, isSuperAdmin: false, regionIds: [cleaner.homeRegionId] },
    otherRegionAdmin: { ...superAdmin, isSuperAdmin: false, regionIds: [otherRegion.id] },
    otherOrg: { ...superAdmin, orgId: "another-org" },
  };
}

/** A cleaner with a pending request covering the day of an accepted job two days out. */
async function requestOverJob() {
  const c = await fx.makeCleaner();
  const actor = await fx.actorFor(c.id);
  const { job } = await fx.makeJob(c.id, "ACCEPTED", { daysAhead: 2 });
  const day = dateColumnToLocalDate(job.scheduledDate);
  const res = await requestTimeOff(actor, { startsAt: day, endsAt: addLocalDays(day, 1) });
  if (!res.ok) throw new Error(res.message);
  return { c, job, day, timeOffId: res.data.id };
}

const rankOf = async (jobId: string, cleanerId: string) =>
  (await suggestCleaners(jobId)).find((r) => r.id === cleanerId);

describe.skipIf(!enabled)("time off (integration)", () => {
  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;
  });
  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { actorId: "test-admin", entityType: "TimeOff" } });
    await fx.cleanup();
  });

  it("stores whole days that line up with job dates", () => {
    const r = timeOffRange("2026-12-24", "2026-12-26");
    expect(r.startsAt.toISOString()).toBe("2026-12-24T00:00:00.000Z");
    expect(r.endsAt.toISOString()).toBe("2026-12-26T23:59:59.000Z");
    expect(timeOffDays(r)).toEqual({ from: "2026-12-24", to: "2026-12-26" });
    expect(() => timeOffRange("2026-12-26", "2026-12-24")).toThrow();
  });

  it("a request changes nothing until it is approved; approval takes the cleaner off dispatch", async () => {
    const { c, job, timeOffId } = await requestOverJob();
    const { superAdmin } = await scopes(c);

    expect((await pendingTimeOff(superAdmin)).map((t) => t.id)).toContain(timeOffId);
    expect((await rankOf(job.id, c.id))?.warnings ?? []).not.toContain("on time off");

    const approved = await decideTimeOff(superAdmin, timeOffId, "APPROVED");
    // They're still on a job that day: the admin is told to reassign it.
    expect(approved.warnings[0]).toMatch(/Still assigned to 1 job/);
    expect((await pendingTimeOff(superAdmin)).map((t) => t.id)).not.toContain(timeOffId);
    const ranked = await rankOf(job.id, c.id);
    expect(ranked?.eligible).toBe(false);
    expect(ranked?.warnings).toContain("on time off");

    // Assigning them by hand still works, with a warning.
    const { job: second } = await fx.makeJob((await fx.makeCleaner()).id, "OFFERED", {
      daysAhead: 2,
    });
    const manual = await assignCleaner(second.id, c.id, SYSTEM, { force: true });
    expect(manual.ok && manual.warnings.join(" ")).toMatch(/approved time off that day/);

    // The cleaner was told, and the decision is on record.
    const told = await prisma.notification.findMany({
      where: { recipientId: c.id, templateKey: "cleaner.time_off.approved" },
    });
    expect(told.length).toBeGreaterThanOrEqual(1);
    expect(
      await prisma.auditLog.count({ where: { entityId: timeOffId, action: "time_off.approve" } }),
    ).toBe(1);

    // Revoking puts them back on the schedule.
    await decideTimeOff(superAdmin, timeOffId, "DENIED");
    expect((await rankOf(job.id, c.id))?.warnings ?? []).not.toContain("on time off");
  });

  it("does not block the days before or after", async () => {
    const c = await fx.makeCleaner();
    const { superAdmin } = await scopes(c);
    const { job } = await fx.makeJob(c.id, "ACCEPTED", { daysAhead: 3 });
    const day = dateColumnToLocalDate(job.scheduledDate);
    await addTimeOff(superAdmin, c.id, { from: addLocalDays(day, 1), to: addLocalDays(day, 2) });
    await addTimeOff(superAdmin, c.id, { from: addLocalDays(day, -2), to: addLocalDays(day, -1) });
    expect((await rankOf(job.id, c.id))?.warnings ?? []).not.toContain("on time off");
  });

  it("time off added by an admin is approved at once, lists conflicts, and can be removed", async () => {
    const c = await fx.makeCleaner();
    const { superAdmin } = await scopes(c);
    const { job } = await fx.makeJob(c.id, "ACCEPTED", { daysAhead: 4 });
    const day = dateColumnToLocalDate(job.scheduledDate);

    const added = await addTimeOff(superAdmin, c.id, { from: day, to: day, reason: " Dentist " });
    expect(added.warnings).toHaveLength(1);
    const rows = await cleanerTimeOff(c.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "APPROVED", reason: "Dentist" });
    expect(await timeOffConflicts(c.id, rows[0].startsAt, rows[0].endsAt)).toMatchObject([
      { jobId: job.id, date: day },
    ]);
    expect((await rankOf(job.id, c.id))?.warnings).toContain("on time off");

    await removeTimeOff(superAdmin, added.id);
    expect(await cleanerTimeOff(c.id)).toHaveLength(0);
    expect((await rankOf(job.id, c.id))?.warnings ?? []).not.toContain("on time off");
    await expect(removeTimeOff(superAdmin, added.id)).rejects.toThrow(/no longer exists/);
  });

  it("refuses admins from another region or organization", async () => {
    const { c, timeOffId } = await requestOverJob();
    const s = await scopes(c);
    const today = todayIn("America/Toronto");

    await expect(decideTimeOff(s.otherRegionAdmin, timeOffId, "APPROVED")).rejects.toThrow();
    await expect(decideTimeOff(s.otherOrg, timeOffId, "APPROVED")).rejects.toThrow();
    await expect(removeTimeOff(s.otherRegionAdmin, timeOffId)).rejects.toThrow();
    await expect(addTimeOff(s.otherOrg, c.id, { from: today, to: today })).rejects.toThrow();
    expect((await pendingTimeOff(s.otherRegionAdmin)).map((t) => t.id)).not.toContain(timeOffId);
    expect((await prisma.timeOff.findUniqueOrThrow({ where: { id: timeOffId } })).status).toBe(
      "REQUESTED",
    );

    // The cleaner's own region admin can.
    expect((await pendingTimeOff(s.homeRegionAdmin)).map((t) => t.id)).toContain(timeOffId);
    await decideTimeOff(s.homeRegionAdmin, timeOffId, "APPROVED");
    expect((await prisma.timeOff.findUniqueOrThrow({ where: { id: timeOffId } })).status).toBe(
      "APPROVED",
    );
  });
});
