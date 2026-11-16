import type { Prisma } from "@/generated/prisma/client";
import type { JobStatus } from "@/generated/prisma/enums";
import { jobPayload } from "@/modules/webhooks/payloads";
import { recordWebhookEvent } from "@/modules/webhooks/queue";
import { TransitionError, canTransition, jobWebhookEvent, type Actor } from "./transitions";

export * from "./transitions";

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
    select: { status: true, paymentStatus: true, completedAt: true, organizationId: true },
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
  const event = await tx.jobEvent.create({
    data: {
      jobId,
      type: "STATUS_CHANGED",
      actorType: actor.type,
      actorId: actor.id ?? null,
      data: { from: job.status, to, ...data },
    },
  });
  const webhook = jobWebhookEvent(job.status, to);
  if (webhook)
    await recordWebhookEvent(tx, {
      organizationId: job.organizationId,
      type: webhook,
      key: `${webhook}:${event.id}`,
      data: (db) => jobPayload(db, jobId),
    });
  return updated;
}
