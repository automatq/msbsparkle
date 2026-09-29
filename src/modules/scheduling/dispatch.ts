import { prisma } from "@/modules/db/client";
import type { Actor } from "@/modules/jobs/state-machine";
import { dateColumnToLocalDate, localDateToDateColumn, weekdayOf } from "@/modules/shared/dates";
import { assignCleaner, effectiveEnd, findConflicts } from "./assignment";
import { rankCleaners, type CandidateCleaner, type RankedCleaner } from "./ranking";

const SKILL_FOR_SERVICE: Record<string, string> = {
  deep: "DEEP_CLEAN",
  "move-in-out": "MOVE_OUT",
  "post-renovation": "POST_RENO",
  office: "COMMERCIAL",
  airbnb: "AIRBNB",
};

/** Loads everything the pure ranker needs for one job and returns ordered suggestions. */
export async function suggestCleaners(jobId: string): Promise<RankedCleaner[]> {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: { service: true, booking: true },
  });
  const date = dateColumnToLocalDate(job.scheduledDate);
  const weekday = weekdayOf(date);
  const dayStart = new Date(job.scheduledStartAt.getTime() - 12 * 3600_000);
  const dayEnd = new Date(job.scheduledStartAt.getTime() + 12 * 3600_000);
  const cleaners = await prisma.cleaner.findMany({
    where: {
      organizationId: job.organizationId,
      status: { in: ["ACTIVE", "ONBOARDING", "INACTIVE"] },
    },
    include: {
      regions: true,
      skills: true,
      availability: { where: { weekday } },
      timeOff: {
        where: {
          status: "APPROVED",
          startsAt: { lte: job.scheduledEndAt },
          endsAt: { gte: job.scheduledStartAt },
        },
      },
      assignments: {
        where: {
          status: "ACCEPTED",
          job: {
            id: { not: job.id },
            scheduledDate: localDateToDateColumn(date),
            status: { in: ["CONFIRMED", "ASSIGNED", "EN_ROUTE", "IN_PROGRESS"] },
            scheduledStartAt: { gte: dayStart, lte: dayEnd },
          },
        },
        select: { id: true },
      },
    },
  });
  const history = await prisma.assignment.groupBy({
    by: ["cleanerId"],
    where: { status: "ACCEPTED", job: { customerId: job.customerId, status: "COMPLETED" } },
    _count: { _all: true },
  });
  const served = new Map(history.map((h) => [h.cleanerId, h._count._all]));
  const candidates: CandidateCleaner[] = [];
  for (const c of cleaners) {
    const conflicts =
      c.status === "ACTIVE"
        ? (await findConflicts(c.id, job.scheduledStartAt, effectiveEnd(job), job.id)).length
        : 0;
    candidates.push({
      id: c.id,
      firstName: `${c.firstName} ${c.lastName[0]}.`,
      status: c.status,
      servesRegion:
        c.homeRegionId === job.regionId || c.regions.some((r) => r.regionId === job.regionId),
      skills: c.skills.map((s) => s.skill),
      ratingAvg: c.ratingAvg ? Number(c.ratingAvg) : null,
      ratingCount: c.ratingCount,
      maxJobsPerDay: c.maxJobsPerDay,
      availability: c.availability.map((a) => ({ startLocal: a.startLocal, endLocal: a.endLocal })),
      onTimeOff: c.timeOff.length > 0,
      jobsThatDay: c.assignments.length,
      conflicts,
      completedForCustomer: served.get(c.id) ?? 0,
      isPreferred: job.booking.preferredCleanerId === c.id,
    });
  }
  return rankCleaners(
    {
      date,
      windowStartLocal: job.windowStartLocal,
      windowEndLocal: job.windowEndLocal,
      estimatedMinutes: job.estimatedMinutes,
      requiredSkill: SKILL_FOR_SERVICE[job.service.slug] ?? null,
    },
    candidates,
  ).filter((r) => r.eligible || r.warnings[0] !== "does not serve this region");
}

export type AutoAssignResult = {
  assigned: { jobId: string; cleaner: string }[];
  skipped: { jobId: string; reason: string }[];
};

/** Assigns the top eligible suggestion to every unassigned job in a region on a date. */
export async function autoAssignDay(
  regionId: string,
  date: string,
  actor: Actor,
): Promise<AutoAssignResult> {
  const jobs = await prisma.job.findMany({
    where: {
      regionId,
      scheduledDate: localDateToDateColumn(date),
      status: { in: ["PENDING", "CONFIRMED"] },
      assignments: { none: { status: { in: ["ACCEPTED", "OFFERED"] } } },
    },
    orderBy: [{ windowStartLocal: "asc" }, { estimatedMinutes: "desc" }],
    select: { id: true },
  });
  const result: AutoAssignResult = { assigned: [], skipped: [] };
  for (const j of jobs) {
    const ranked = await suggestCleaners(j.id);
    const pick = ranked.find(
      (r) => r.eligible && !r.warnings.some((w) => w.startsWith("at daily limit")),
    );
    if (!pick) {
      result.skipped.push({ jobId: j.id, reason: "no eligible cleaner" });
      continue;
    }
    const res = await assignCleaner(j.id, pick.id, actor);
    if (res.ok) result.assigned.push({ jobId: j.id, cleaner: pick.firstName });
    else result.skipped.push({ jobId: j.id, reason: res.message });
  }
  return result;
}
