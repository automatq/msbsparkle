/**
 * Cleaner time off: requested by cleaners (app / portal), decided by admins, or entered by an
 * admin directly. Only APPROVED time off affects scheduling (capacity and dispatch).
 *
 * Storage convention: whole days. `startsAt` is 00:00:00Z of the first day and `endsAt` is
 * 23:59:59Z of the last, so they compare directly with `@db.Date` columns such as
 * `Job.scheduledDate` (also UTC midnight of the local date), independent of the region timezone.
 */
import type { Prisma } from "@/generated/prisma/client";
import type { TimeOffStatus } from "@/generated/prisma/enums";
import { ForbiddenError, assertRegionAccess, type Ctx } from "@/modules/auth/access";
import { prisma } from "@/modules/db/client";
import { appUrl, brand, cleanerTarget, notify } from "@/modules/notifications/send";
import { cleanerTimeOffTemplate } from "@/modules/notifications/templates";
import {
  dateColumnToLocalDate,
  localDateToDateColumn,
  type LocalDate,
} from "@/modules/shared/dates";

/** Who is acting: the admin's organization and the regions they may manage. */
export type AdminScope = Pick<Ctx, "orgId" | "regionIds" | "isSuperAdmin" | "userId">;

const OPEN_JOB = ["PENDING", "CONFIRMED", "ASSIGNED", "EN_ROUTE", "IN_PROGRESS"] as const;

export class TimeOffError extends Error {}

/** Prisma filter: approved time off covering the day of a job (`Job.scheduledDate`). */
export function approvedTimeOffOn(scheduledDate: Date): Prisma.TimeOffWhereInput {
  return { status: "APPROVED", startsAt: { lte: scheduledDate }, endsAt: { gte: scheduledDate } };
}

export function timeOffRange(from: LocalDate, to: LocalDate): { startsAt: Date; endsAt: Date } {
  const startsAt = localDateToDateColumn(from);
  const endsAt = new Date(localDateToDateColumn(to).getTime() + 86_400_000 - 1000);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || to < from)
    throw new TimeOffError("Check the dates.");
  return { startsAt, endsAt };
}

/** The first and last day of a stored time-off row. */
export function timeOffDays(t: { startsAt: Date; endsAt: Date }): {
  from: LocalDate;
  to: LocalDate;
} {
  return { from: dateColumnToLocalDate(t.startsAt), to: dateColumnToLocalDate(t.endsAt) };
}

/** Jobs the cleaner is on (accepted or offered) during the days off. */
export async function timeOffConflicts(cleanerId: string, startsAt: Date, endsAt: Date) {
  const rows = await prisma.assignment.findMany({
    where: {
      cleanerId,
      status: { in: ["ACCEPTED", "OFFERED"] },
      job: { status: { in: [...OPEN_JOB] }, scheduledDate: { gte: startsAt, lte: endsAt } },
    },
    select: {
      job: {
        select: {
          id: true,
          scheduledDate: true,
          windowStartLocal: true,
          booking: { select: { bookingNumber: true } },
        },
      },
    },
    orderBy: { job: { scheduledDate: "asc" } },
  });
  return rows.map((r) => ({
    jobId: r.job.id,
    date: dateColumnToLocalDate(r.job.scheduledDate),
    window: r.job.windowStartLocal,
    bookingNumber: r.job.booking.bookingNumber,
  }));
}

function conflictWarning(conflicts: Awaited<ReturnType<typeof timeOffConflicts>>): string[] {
  if (!conflicts.length) return [];
  const list = conflicts
    .slice(0, 5)
    .map((c) => `${c.bookingNumber} (${c.date})`)
    .join(", ");
  const more = conflicts.length > 5 ? ` and ${conflicts.length - 5} more` : "";
  return [
    `Still assigned to ${conflicts.length} job${conflicts.length > 1 ? "s" : ""} in that period: ${list}${more}. Reassign them.`,
  ];
}

/** Loads a cleaner the admin may manage (same organization, and their home region in scope). */
async function manageableCleaner(scope: AdminScope, cleanerId: string) {
  const cleaner = await prisma.cleaner.findUnique({
    where: { id: cleanerId },
    select: { id: true, organizationId: true, homeRegionId: true, firstName: true },
  });
  if (!cleaner || cleaner.organizationId !== scope.orgId)
    throw new ForbiddenError("No access to this cleaner");
  assertRegionAccess(scope, cleaner.homeRegionId);
  return cleaner;
}

async function manageableTimeOff(scope: AdminScope, timeOffId: string) {
  const t = await prisma.timeOff.findUnique({ where: { id: timeOffId } });
  if (!t) throw new TimeOffError("That time-off entry no longer exists.");
  const cleaner = await manageableCleaner(scope, t.cleanerId);
  return { t, cleaner };
}

async function audit(
  scope: AdminScope,
  regionId: string,
  entityId: string,
  action: string,
  before: Prisma.InputJsonValue | null,
  after: Prisma.InputJsonValue | null,
) {
  await prisma.auditLog.create({
    data: {
      organizationId: scope.orgId,
      regionId,
      actorType: "ADMIN",
      actorId: scope.userId,
      entityType: "TimeOff",
      entityId,
      action,
      ...(before ? { before } : {}),
      ...(after ? { after } : {}),
    },
  });
}

async function tellCleaner(
  t: { id: string; cleanerId: string; startsAt: Date; endsAt: Date; status: TimeOffStatus },
  firstName: string,
  kind: "approved" | "denied" | "added" | "removed",
) {
  const { from, to } = timeOffDays(t);
  await notify(
    await cleanerTarget(t.cleanerId),
    `cleaner.time_off.${kind}`,
    cleanerTimeOffTemplate({
      brand: brand(),
      firstName,
      kind,
      from,
      to,
      url: `${appUrl()}/cleaner/availability`,
    }),
    // One message per decision: flipping approved → denied → approved tells them each time.
    `cleaner.time_off.${kind}:${t.id}:${Date.now()}`,
    ["push", "email", "sms"],
    { smsOnlyWithoutPush: true },
  );
}

export type TimeOffResult = { id: string; warnings: string[] };

/** Approves or denies a request. A decision can be changed later. */
export async function decideTimeOff(
  scope: AdminScope,
  timeOffId: string,
  decision: "APPROVED" | "DENIED",
): Promise<TimeOffResult> {
  const { t, cleaner } = await manageableTimeOff(scope, timeOffId);
  if (t.status === decision) return { id: t.id, warnings: [] };
  const updated = await prisma.timeOff.update({
    where: { id: t.id },
    data: { status: decision },
  });
  await audit(
    scope,
    cleaner.homeRegionId,
    t.id,
    decision === "APPROVED" ? "time_off.approve" : "time_off.deny",
    { status: t.status },
    { status: decision },
  );
  await tellCleaner(updated, cleaner.firstName, decision === "APPROVED" ? "approved" : "denied");
  const warnings =
    decision === "APPROVED"
      ? conflictWarning(await timeOffConflicts(t.cleanerId, t.startsAt, t.endsAt))
      : [];
  return { id: t.id, warnings };
}

/** Time off entered by an admin on the cleaner's behalf: approved straight away. */
export async function addTimeOff(
  scope: AdminScope,
  cleanerId: string,
  input: { from: LocalDate; to: LocalDate; reason?: string | null },
): Promise<TimeOffResult> {
  const cleaner = await manageableCleaner(scope, cleanerId);
  const range = timeOffRange(input.from, input.to);
  const created = await prisma.timeOff.create({
    data: {
      cleanerId,
      ...range,
      reason: input.reason?.trim() || null,
      status: "APPROVED",
    },
  });
  await audit(scope, cleaner.homeRegionId, created.id, "time_off.add", null, {
    from: input.from,
    to: input.to,
  });
  await tellCleaner(created, cleaner.firstName, "added");
  return {
    id: created.id,
    warnings: conflictWarning(await timeOffConflicts(cleanerId, range.startsAt, range.endsAt)),
  };
}

/** Removes an entry. The cleaner is told when approved time off is taken away. */
export async function removeTimeOff(scope: AdminScope, timeOffId: string): Promise<void> {
  const { t, cleaner } = await manageableTimeOff(scope, timeOffId);
  await prisma.timeOff.delete({ where: { id: t.id } });
  await audit(
    scope,
    cleaner.homeRegionId,
    t.id,
    "time_off.remove",
    {
      ...timeOffDays(t),
      status: t.status,
    },
    null,
  );
  if (t.status === "APPROVED" && t.endsAt >= new Date())
    await tellCleaner(t, cleaner.firstName, "removed");
}

/** Requests waiting for a decision, for the cleaners the admin manages. Oldest first. */
export async function pendingTimeOff(scope: AdminScope) {
  return prisma.timeOff.findMany({
    where: {
      status: "REQUESTED",
      endsAt: { gte: new Date(Date.now() - 86_400_000) },
      cleaner: {
        organizationId: scope.orgId,
        ...(scope.isSuperAdmin ? {} : { homeRegionId: { in: scope.regionIds } }),
      },
    },
    include: { cleaner: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { startsAt: "asc" },
  });
}

/** A cleaner's current and upcoming time off, plus anything decided in the last 30 days. */
export async function cleanerTimeOff(cleanerId: string) {
  return prisma.timeOff.findMany({
    where: { cleanerId, endsAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
    orderBy: { startsAt: "asc" },
  });
}
