import { inngest, type Events } from "./client";
import { runPushReceipts } from "@/modules/notifications/push";
import { chargeCompletedJob, runPaymentRetries } from "./tasks/charges";
import { runCutoff } from "./tasks/cutoff";
import { runAdminDigest } from "./tasks/digest";
import {
  notifyCleanerAssigned,
  notifyCleanerJobChanged,
  notifyCustomerTracking,
  sendBookingConfirmationSms,
  sendReviewRequest,
} from "./tasks/notify";
import { runReminders } from "./tasks/reminders";
import { runRetention } from "./tasks/retention";
import { runSeriesMaterialization } from "./tasks/series";
import { timezone } from "@/modules/shared/country";

const grace = () => `${Number(process.env.CHARGE_GRACE_MINUTES ?? 120)}m`;

export const onBookingConfirmed = inngest.createFunction(
  { id: "booking-confirmed", triggers: [{ event: "booking/confirmed" }] },
  async ({ event, step }) => {
    await step.run("confirmation-sms", () =>
      sendBookingConfirmationSms(event.data.bookingId as string),
    );
  },
);

export const onJobAssigned = inngest.createFunction(
  { id: "job-assigned", triggers: [{ event: "job/assigned" }] },
  async ({ event, step }) => {
    const d = event.data as { jobId: string; cleanerId: string; offered: boolean };
    await step.run("notify-cleaner", () => notifyCleanerAssigned(d.jobId, d.cleanerId, d.offered));
  },
);

export const onCleanerJobChanged = inngest.createFunction(
  { id: "job-cleaner-changed", triggers: [{ event: "job/cleaner-changed" }] },
  async ({ event, step }) => {
    const d = event.data as Events["job/cleaner-changed"]["data"];
    for (const cleanerId of d.cleanerIds)
      await step.run(`notify-${cleanerId}`, () =>
        notifyCleanerJobChanged(d.jobId, cleanerId, d.change, {
          nonce: d.nonce,
          previousStartAt: d.previousStartAt,
        }),
      );
  },
);

export const onTracking = inngest.createFunction(
  { id: "job-tracking", triggers: [{ event: "job/tracking" }] },
  async ({ event, step }) => {
    const d = event.data as Events["job/tracking"]["data"];
    await step.run("notify-customer", () => notifyCustomerTracking(d.assignmentId, d.kind));
  },
);

export const onJobCompleted = inngest.createFunction(
  { id: "job-completed", triggers: [{ event: "job/completed" }] },
  async ({ event, step }) => {
    const jobId = event.data.jobId as string;
    await step.sleep("grace-period", grace());
    const charge = await step.run("charge", () => chargeCompletedJob(jobId));
    await step.run("review-request", () => sendReviewRequest(jobId));
    return charge;
  },
);

export const reminders = inngest.createFunction(
  { id: "reminders", triggers: [{ cron: "*/15 * * * *" }] },
  async ({ step }) => step.run("send", () => runReminders()),
);
export const cutoff = inngest.createFunction(
  { id: "price-lock-cutoff", triggers: [{ cron: "*/15 * * * *" }] },
  async ({ step }) => step.run("lock", () => runCutoff()),
);
export const paymentRetries = inngest.createFunction(
  { id: "payment-retries", triggers: [{ cron: "0 * * * *" }] },
  async ({ step }) => step.run("retry", () => runPaymentRetries()),
);
export const materializeSeries = inngest.createFunction(
  { id: "materialize-series", triggers: [{ cron: "0 3 * * *" }] },
  async ({ step }) => step.run("materialize", () => runSeriesMaterialization()),
);
export const adminDigest = inngest.createFunction(
  { id: "admin-digest", triggers: [{ cron: `TZ=${timezone} 0 7 * * *` }] },
  async ({ step }) => step.run("digest", () => runAdminDigest()),
);

export const pushReceipts = inngest.createFunction(
  { id: "push-receipts", triggers: [{ cron: "*/30 * * * *" }] },
  async ({ step }) => step.run("check", () => runPushReceipts()),
);

export const retention = inngest.createFunction(
  { id: "retention", triggers: [{ cron: "30 4 * * *" }] },
  async ({ step }) => step.run("purge", () => runRetention()),
);

export const functions = [
  onBookingConfirmed,
  onJobAssigned,
  onCleanerJobChanged,
  onTracking,
  onJobCompleted,
  reminders,
  cutoff,
  paymentRetries,
  materializeSeries,
  adminDigest,
  retention,
  pushReceipts,
];
