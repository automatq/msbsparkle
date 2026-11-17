import type { ActorType, JobStatus } from "@/generated/prisma/enums";
import type { WebhookEventType } from "@/modules/webhooks/events";

/** Job status rules. Pure, so client components can import them. */
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

/** The webhook a status change sends, if any. */
export function jobWebhookEvent(from: JobStatus, to: JobStatus): WebhookEventType | null {
  if (to === "ASSIGNED") return from === "PENDING" || from === "CONFIRMED" ? "job.assigned" : null;
  if (to === "EN_ROUTE") return "job.en_route";
  if (to === "IN_PROGRESS") return from === "COMPLETED" ? null : "job.started";
  if (to === "COMPLETED") return "job.completed";
  if (to === "CANCELLED" || to === "SKIPPED") return "job.cancelled";
  if (to === "NO_SHOW") return "job.no_show";
  return null;
}
