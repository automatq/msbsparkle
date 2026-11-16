import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/modules/db/client";
import type { Actor } from "@/modules/jobs/state-machine";
import { transitionJob } from "@/modules/jobs/state-machine";
import { emit } from "@/modules/jobs/client";

export type AssignmentConflict = { jobId: string; bookingNumber: string; start: Date; end: Date };

/** Accepted/offered assignments for a cleaner overlapping [start, end). */
export async function findConflicts(
  cleanerId: string,
  start: Date,
  end: Date,
  excludeJobId?: string,
): Promise<AssignmentConflict[]> {
  const rows = await prisma.assignment.findMany({
    where: {
      cleanerId,
      status: { in: ["ACCEPTED", "OFFERED"] },
      job: {
        id: excludeJobId ? { not: excludeJobId } : undefined,
        status: { in: ["CONFIRMED", "ASSIGNED", "EN_ROUTE", "IN_PROGRESS"] },
        scheduledStartAt: { lt: end },
        scheduledEndAt: { gt: start },
      },
    },
    include: {
      job: {
        select: {
          id: true,
          scheduledStartAt: true,
          scheduledEndAt: true,
          booking: { select: { bookingNumber: true } },
        },
      },
    },
  });
  return rows.map((r) => ({
    jobId: r.job.id,
    bookingNumber: r.job.booking.bookingNumber,
    start: r.job.scheduledStartAt,
    end: r.job.scheduledEndAt,
  }));
}

export type AssignResult =
  | { ok: true; assignmentId: string; warnings: string[] }
  | {
      ok: false;
      code: "CONFLICT" | "INELIGIBLE" | "JOB_CLOSED";
      message: string;
      conflicts?: AssignmentConflict[];
    };

/** Job end for conflict purposes = later of window end and window start + estimated minutes. */
export function effectiveEnd(job: {
  scheduledStartAt: Date;
  scheduledEndAt: Date;
  estimatedMinutes: number;
  hourlyCleaners: number | null;
}): Date {
  const cleaners = Math.max(1, job.hourlyCleaners ?? 1);
  const byWork = new Date(
    job.scheduledStartAt.getTime() + Math.ceil(job.estimatedMinutes / cleaners) * 60_000,
  );
  return byWork > job.scheduledEndAt ? byWork : job.scheduledEndAt;
}

export async function assignCleaner(
  jobId: string,
  cleanerId: string,
  actor: Actor,
  opts: { role?: "LEAD" | "MEMBER"; force?: boolean } = {},
): Promise<AssignResult> {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: { region: true, assignments: true },
  });
  if (["COMPLETED", "CANCELLED", "SKIPPED", "NO_SHOW"].includes(job.status))
    return { ok: false, code: "JOB_CLOSED", message: "This job is closed." };
  const cleaner = await prisma.cleaner.findUniqueOrThrow({
    where: { id: cleanerId },
    include: { regions: true },
  });
  const warnings: string[] = [];
  if (cleaner.status !== "ACTIVE")
    return { ok: false, code: "INELIGIBLE", message: `${cleaner.firstName} is not active.` };
  if (
    !cleaner.regions.some((r) => r.regionId === job.regionId) &&
    cleaner.homeRegionId !== job.regionId
  )
    warnings.push(`${cleaner.firstName} does not normally serve ${job.region.name}.`);

  const conflicts = await findConflicts(cleanerId, job.scheduledStartAt, effectiveEnd(job), jobId);
  if (conflicts.length && !opts.force) {
    return {
      ok: false,
      code: "CONFLICT",
      message: `${cleaner.firstName} already has ${conflicts.map((c) => c.bookingNumber).join(", ")} in that window.`,
      conflicts,
    };
  }
  if (conflicts.length)
    warnings.push(`Overlaps ${conflicts.map((c) => c.bookingNumber).join(", ")}.`);

  const sameDay = await prisma.assignment.count({
    where: {
      cleanerId,
      status: "ACCEPTED",
      job: {
        id: { not: jobId },
        scheduledDate: job.scheduledDate,
        status: { in: ["CONFIRMED", "ASSIGNED", "EN_ROUTE", "IN_PROGRESS"] },
      },
    },
  });
  if (sameDay >= cleaner.maxJobsPerDay)
    warnings.push(
      `${cleaner.firstName} already has ${sameDay} jobs that day (max ${cleaner.maxJobsPerDay}).`,
    );

  const status = job.region.requireCleanerAcceptance ? "OFFERED" : "ACCEPTED";
  const role =
    opts.role ??
    (job.assignments.some((a) => a.status === "ACCEPTED" && a.role === "LEAD") ? "MEMBER" : "LEAD");

  const assignmentId = await prisma.$transaction(async (tx) => {
    const a = await tx.assignment.upsert({
      where: { jobId_cleanerId: { jobId, cleanerId } },
      update: {
        status,
        role,
        offeredAt: new Date(),
        respondedAt: status === "ACCEPTED" ? new Date() : null,
        assignedByUserId: actor.id ?? null,
        removedReason: null,
      },
      create: {
        jobId,
        cleanerId,
        status,
        role,
        respondedAt: status === "ACCEPTED" ? new Date() : null,
        assignedByUserId: actor.id ?? null,
      },
    });
    await tx.jobEvent.create({
      data: {
        jobId,
        type: "ASSIGNED",
        actorType: actor.type,
        actorId: actor.id ?? null,
        data: { cleanerId, status, role, warnings },
      },
    });
    if (status === "ACCEPTED" && (job.status === "CONFIRMED" || job.status === "PENDING")) {
      if (job.status === "PENDING") await transitionJob(tx, jobId, "CONFIRMED", actor);
      await transitionJob(tx, jobId, "ASSIGNED", actor, { cleanerId });
    }
    return a.id;
  });
  await emit("job/assigned", { jobId, cleanerId, offered: status === "OFFERED" });
  return { ok: true, assignmentId, warnings };
}

export async function unassignCleaner(
  jobId: string,
  cleanerId: string,
  actor: Actor,
  reason = "REASSIGNED",
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const a = await tx.assignment.findUnique({ where: { jobId_cleanerId: { jobId, cleanerId } } });
    if (!a || a.status === "REMOVED" || a.status === "DECLINED") return;
    await tx.assignment.update({
      where: { id: a.id },
      data: { status: "REMOVED", removedReason: reason, respondedAt: new Date() },
    });
    await tx.jobEvent.create({
      data: {
        jobId,
        type: "UNASSIGNED",
        actorType: actor.type,
        actorId: actor.id ?? null,
        data: { cleanerId, reason },
      },
    });
    const job = await tx.job.findUniqueOrThrow({
      where: { id: jobId },
      include: { assignments: true },
    });
    const stillAccepted = job.assignments.some((x) => x.status === "ACCEPTED");
    if (!stillAccepted && (job.status === "ASSIGNED" || job.status === "EN_ROUTE")) {
      await transitionJob(tx, jobId, job.status === "EN_ROUTE" ? "ASSIGNED" : "CONFIRMED", actor, {
        reason: "all cleaners removed",
      });
      if (job.status === "EN_ROUTE")
        await transitionJob(tx, jobId, "CONFIRMED", actor, { reason: "all cleaners removed" });
    }
  });
}

export type RescheduleInput = {
  jobId: string;
  scheduledDate: string;
  windowId: string;
  actor: Actor;
  override?: boolean;
};

export async function rescheduleJob(
  input: RescheduleInput,
  deps: {
    loadAvailability: typeof import("./availability").loadAvailability;
    zonedToInstant: typeof import("@/modules/shared/dates").zonedToInstant;
    localDateToDateColumn: typeof import("@/modules/shared/dates").localDateToDateColumn;
  },
) {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: input.jobId },
    include: { assignments: { where: { status: { in: ["ACCEPTED", "OFFERED"] } } } },
  });
  if (["COMPLETED", "CANCELLED", "SKIPPED", "NO_SHOW", "IN_PROGRESS"].includes(job.status))
    return { ok: false as const, message: "This job can no longer be rescheduled." };
  const window = await prisma.arrivalWindow.findUniqueOrThrow({ where: { id: input.windowId } });
  if (window.regionId !== job.regionId)
    return { ok: false as const, message: "Window belongs to another region." };
  if (!input.override) {
    const [day] = await deps.loadAvailability(
      job.regionId,
      input.scheduledDate,
      input.scheduledDate,
    );
    const slot = day?.windows.find((w) => w.windowId === window.id);
    if (!slot?.open)
      return {
        ok: false as const,
        message: slot?.reason === "FULL" ? "That window is full." : "That window is not available.",
      };
  }
  const start = deps.zonedToInstant(input.scheduledDate, window.startLocal, job.timezone);
  const end = deps.zonedToInstant(input.scheduledDate, window.endLocal, job.timezone);
  const warnings: string[] = [];
  for (const a of job.assignments) {
    const conflicts = await findConflicts(a.cleanerId, start, end, job.id);
    if (conflicts.length)
      warnings.push(
        `Assigned cleaner now overlaps ${conflicts.map((c) => c.bookingNumber).join(", ")}.`,
      );
  }
  const before = { scheduledDate: job.scheduledDate, windowStartLocal: job.windowStartLocal };
  await prisma.$transaction(async (tx) => {
    await tx.job.update({
      where: { id: job.id },
      data: {
        scheduledDate: deps.localDateToDateColumn(input.scheduledDate),
        windowStartLocal: window.startLocal,
        windowEndLocal: window.endLocal,
        scheduledStartAt: start,
        scheduledEndAt: end,
        detached: true,
      },
    });
    await tx.jobEvent.create({
      data: {
        jobId: job.id,
        type: "RESCHEDULED",
        actorType: input.actor.type,
        actorId: input.actor.id ?? null,
        data: {
          before,
          after: { scheduledDate: input.scheduledDate, windowStartLocal: window.startLocal },
          warnings,
        } as Prisma.InputJsonValue,
      },
    });
  });
  return { ok: true as const, warnings };
}
