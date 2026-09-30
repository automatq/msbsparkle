import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/modules/db/client";
import { runSeriesMaterialization } from "@/modules/jobs/tasks/series";
import { cleanupTestCustomer, seedTestBooking } from "@/modules/testing/fixtures";
import { adjustJobPrice, applySeriesEdit, previewSeriesEdit } from "./edit-booking";

const created: string[] = [];
const actor = { type: "ADMIN" as const, id: null };

describe.skipIf(!process.env.DATABASE_URL)("series edits (integration)", () => {
  afterAll(async () => {
    for (const id of created) await cleanupTestCustomer(id);
  });

  it("config edit re-prices every editable visit in place and keeps the schedule", async () => {
    const { booking, customer } = await seedTestBooking({
      startInHours: 72,
      frequency: "BIWEEKLY",
    });
    created.push(customer.id);
    await runSeriesMaterialization();
    const before = await prisma.job.findMany({
      where: { bookingId: booking.id },
      orderBy: { sequenceNumber: "asc" },
      include: { activeQuote: true },
    });
    expect(before.length).toBeGreaterThanOrEqual(4);

    const preview = await previewSeriesEdit(booking.id, { bedrooms: 3 });
    expect(preview.scheduleChange).toBe(false);
    expect(preview.newCents).toBeGreaterThan(preview.currentCents);
    expect(preview.affectedVisits).toBe(before.length);

    const res = await applySeriesEdit(booking.id, { bedrooms: 3 }, actor);
    expect(res).toMatchObject({ ok: true, repriced: before.length, regenerated: 0 });
    const after = await prisma.job.findMany({
      where: { bookingId: booking.id },
      orderBy: { sequenceNumber: "asc" },
      include: { activeQuote: true },
    });
    expect(after.map((j) => j.scheduledDate.toISOString())).toEqual(
      before.map((j) => j.scheduledDate.toISOString()),
    );
    expect(after.every((j) => j.bedrooms === 3)).toBe(true);
    // Non-first visits all carry the new recurring price.
    const recurring = after.slice(1).map((j) => j.activeQuote!.totalCents);
    expect(new Set(recurring).size).toBe(1);
    expect(recurring[0]).toBe(preview.newCents);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).bedrooms).toBe(
      3,
    );
  });

  it("schedule edit regenerates the series with unique sequence numbers and stays idempotent", async () => {
    const { booking, customer, windows } = await seedTestBooking({
      startInHours: 72,
      frequency: "BIWEEKLY",
    });
    created.push(customer.id);
    await runSeriesMaterialization();
    const before = await prisma.job.count({ where: { bookingId: booking.id } });

    const res = await applySeriesEdit(
      booking.id,
      { frequency: "WEEKLY", windowId: windows[1].id },
      actor,
    );
    expect(res.ok).toBe(true);
    const jobs = await prisma.job.findMany({
      where: { bookingId: booking.id },
      orderBy: { sequenceNumber: "asc" },
    });
    expect(jobs.length).toBeGreaterThan(before); // weekly has more visits than bi-weekly over the same horizon
    expect(new Set(jobs.map((j) => j.sequenceNumber)).size).toBe(jobs.length);
    expect(jobs.every((j) => j.windowStartLocal === windows[1].startLocal)).toBe(true);
    const gaps = jobs
      .slice(1)
      .map((j, i) => (j.scheduledDate.getTime() - jobs[i].scheduledDate.getTime()) / 86_400_000);
    expect(gaps.every((g) => g === 7)).toBe(true);
    const b = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(b.frequency).toBe("WEEKLY");

    await runSeriesMaterialization();
    expect(await prisma.job.count({ where: { bookingId: booking.id } })).toBe(jobs.length);
  });

  it("skips locked and individually edited visits", async () => {
    const { booking, job, customer } = await seedTestBooking({
      startInHours: 72,
      frequency: "BIWEEKLY",
    });
    created.push(customer.id);
    await runSeriesMaterialization();
    await prisma.job.update({ where: { id: job.id }, data: { priceLockedAt: new Date() } });
    const second = await prisma.job.findFirstOrThrow({
      where: { bookingId: booking.id, sequenceNumber: 2 },
    });
    await prisma.job.update({ where: { id: second.id }, data: { detached: true } });
    const total = await prisma.job.count({ where: { bookingId: booking.id } });
    const res = await applySeriesEdit(booking.id, { bedrooms: 4 }, actor);
    expect(res).toMatchObject({ ok: true, repriced: total - 2 });
    expect((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).bedrooms).toBe(2);
    expect((await prisma.job.findUniqueOrThrow({ where: { id: second.id } })).bedrooms).toBe(2);
  });

  it("admin price adjustment adds a pre-tax line, recomputes tax, and detaches the visit", async () => {
    const { job, customer } = await seedTestBooking({ startInHours: 72 });
    created.push(customer.id);
    const res = await adjustJobPrice(job.id, -1000, "missed area last time", actor);
    expect(res).toEqual({ ok: true, totalCents: Math.round(12900 * 1.13) });
    const after = await prisma.job.findUniqueOrThrow({
      where: { id: job.id },
      include: { activeQuote: true },
    });
    expect(after.detached).toBe(true);
    expect(after.activeQuote!.reason).toBe("ADMIN_ADJUSTMENT");
    expect((await adjustJobPrice(job.id, -99_999_00, "too much", actor)).ok).toBe(false);
  });
});
