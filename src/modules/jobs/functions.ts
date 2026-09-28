import { inngest } from "./client";
import { chargeCompletedJob, runPaymentRetries } from "./tasks/charges";
import { runCutoff } from "./tasks/cutoff";
import { runAdminDigest } from "./tasks/digest";
import {
  notifyCleanerAssigned,
  sendBookingConfirmationSms,
  sendReviewRequest,
} from "./tasks/notify";
import { runReminders } from "./tasks/reminders";
import { runSeriesMaterialization } from "./tasks/series";

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
  { id: "admin-digest", triggers: [{ cron: "TZ=America/Toronto 0 7 * * *" }] },
  async ({ step }) => step.run("digest", () => runAdminDigest()),
);

export const functions = [
  onBookingConfirmed,
  onJobAssigned,
  onJobCompleted,
  reminders,
  cutoff,
  paymentRetries,
  materializeSeries,
  adminDigest,
];
