/** Event types sent to webhook endpoints. Safe to import from client components. */
export const WEBHOOK_EVENTS = {
  "booking.created": "A customer booked (one-time or the first visit of a recurring plan).",
  "booking.cancelled": "A booking was cancelled; no further visits will happen.",
  "job.assigned": "A cleaner was assigned to a visit.",
  "job.rescheduled": "A visit moved to a new date or arrival window.",
  "job.en_route": "The cleaner is on the way.",
  "job.started": "The cleaner checked in and started the visit.",
  "job.completed": "The visit was completed.",
  "job.cancelled": "A visit was cancelled or skipped.",
  "job.no_show": "A visit was marked as a no-show.",
  "payment.succeeded": "A charge succeeded.",
  "payment.failed": "A charge failed.",
  "payment.refunded": "A charge was refunded, fully or partly.",
} as const;

export type WebhookEventType = keyof typeof WEBHOOK_EVENTS;
/** Sent only by the "Send test event" button. */
export const TEST_EVENT = "webhook.test";

export const WEBHOOK_EVENT_TYPES = Object.keys(WEBHOOK_EVENTS) as WebhookEventType[];

export function isWebhookEventType(s: string): s is WebhookEventType {
  return Object.hasOwn(WEBHOOK_EVENTS, s);
}
