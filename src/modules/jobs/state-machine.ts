import type { Prisma } from "@/generated/prisma/client";
import type { ActorType, JobStatus } from "@/generated/prisma/enums";

export const JOB_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED", "SKIPPED"],
  CONFIRMED: ["ASSIGNED", "PENDING", "CANCELLED", "SKIPPED"],
  ASSIGNED: ["CONFIRMED", "EN_ROUTE", "IN_PROGRESS", "CANCELLED", "SKIPPED", "NO_SHOW"],
  EN_ROUTE: ["IN_PROGRESS", "ASSIGNED", "NO_SHOW", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "NO_SHOW"],
  COMPLETED: ["IN_PROGRESS"], // admin reopen only, before capture
  CANCELLED: [],
  SKIPPED: [],
  NO_SHOW: [],
};

export const TERMINAL_JOB_STATUSES: JobStatus[] = ["CANCELLED", "SKIPPED", "NO_SHOW"];

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return JOB_TRANSITIONS[from]?.includes(to) ?? false;
}

export class TransitionError extends Error {
  constructor(
    public from: JobStatus,
    public to: JobStatus,
  ) {
    super(`Cannot move job from ${from} to ${to}`);
  }
}

export type Actor = { type: ActorType; id?: string | null };

/**
 * Single choke point for job status changes: validates the transition, applies
 * side-effect timestamps, and writes a JobEvent. Callers own any broader side effects.
 */
export async function transitionJob(
  tx: Prisma.TransactionClient,
  jobId: string,
  to: JobStatus,
  actor: Actor,
  data: Record<string, unknown> = {},
) {
  const job = await tx.job.findUniqueOrThrow({
    where: { id: jobId },
    select: { status: true, paymentStatus: true, completedAt: true },
  });
  if (!canTransition(job.status, to)) throw new TransitionError(job.status, to);
  if (job.status === "COMPLETED" && to === "IN_PROGRESS") {
    if (actor.type !== "ADMIN") throw new TransitionError(job.status, to);
    if (job.paymentStatus === "PAID") throw new Error("Cannot reopen a job that has been charged");
  }
  const now = new Date();
  const patch: Prisma.JobUpdateInput = { status: to };
  if (to === "IN_PROGRESS" && job.status !== "COMPLETED") patch.actualStartAt = now;
  if (to === "COMPLETED") {
    patch.actualEndAt = now;
    patch.completedAt = now;
  }
  if (to === "CANCELLED" || to === "SKIPPED" || to === "NO_SHOW") {
    patch.cancelledAt = now;
    patch.cancelledBy = actor.type;
    patch.cancellationType =
      to === "SKIPPED"
        ? "SKIPPED"
        : to === "NO_SHOW"
          ? "NO_SHOW"
          : ((data.cancellationType as "FREE" | "LATE" | undefined) ?? "FREE");
    if (typeof data.reason === "string") patch.cancellationReason = data.reason;
  }
  const updated = await tx.job.update({ where: { id: jobId }, data: patch });
  await tx.jobEvent.create({
    data: {
      jobId,
      type: "STATUS_CHANGED",
      actorType: actor.type,
      actorId: actor.id ?? null,
      data: { from: job.status, to, ...data },
    },
  });
  return updated;
}
