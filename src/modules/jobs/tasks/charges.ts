import { prisma } from "@/modules/db/client";
import { appUrl, brand, customerTarget, notify } from "@/modules/notifications/send";
import {
  paymentActionTemplate,
  paymentFailedTemplate,
  receiptTemplate,
} from "@/modules/notifications/templates";
import { STALE_PENDING_MS, createServiceCharge } from "@/modules/payments/charges";
import { isStripeConfigured } from "@/modules/payments/stripe";
import { formatInZone } from "@/modules/shared/dates";

const RETRY_DELAYS_MS = [1, 3, 7].map((d) => d * 86_400_000);

/**
 * Charges a completed job (after the grace period) and handles the outcome:
 * receipt on success; dunning email, retry schedule, and paused series on failure.
 */
export async function chargeCompletedJob(jobId: string): Promise<{ status: string }> {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: {
      customer: true,
      service: true,
      booking: { include: { paymentMethod: true } },
      activeQuote: true,
    },
  });
  if (job.status !== "COMPLETED") return { status: "skipped:not-completed" };
  if (!["UNPAID", "FAILED"].includes(job.paymentStatus))
    return { status: `skipped:${job.paymentStatus}` };
  if (!isStripeConfigured()) return { status: "skipped:no-stripe" };
  const res = await createServiceCharge(jobId, { type: "SYSTEM" });
  const when = formatInZone(job.scheduledStartAt, job.timezone, "EEEE, MMMM d");
  if (res.ok) {
    const msg = receiptTemplate({
      brand: brand(),
      firstName: job.customer.firstName,
      when,
      serviceName: job.service.name,
      amountCents: job.activeQuote?.totalCents ?? 0,
      tipCents: job.tipCents,
      last4: job.booking.paymentMethod?.last4 ?? null,
      receiptsUrl: `${appUrl()}/account/payment`,
    });
    await notify(
      await customerTarget(job.customerId, { jobId }),
      "payment.receipt",
      msg,
      `payment.receipt:${res.chargeId}`,
      ["email"],
    );
    return { status: "charged" };
  }
  if (res.code === "REQUIRES_ACTION") {
    // Off-session charge needs 3D Secure: ask the customer to confirm it on-session. Retrying
    // off-session would only fail again, so no retry is scheduled.
    const charge = await prisma.charge.findFirst({
      where: { jobId, type: "SERVICE", status: "REQUIRES_ACTION" },
      orderBy: { createdAt: "desc" },
    });
    if (charge) {
      const msg = paymentActionTemplate({
        brand: brand(),
        firstName: job.customer.firstName,
        when,
        amountCents: charge.cardCents,
        confirmUrl: `${appUrl()}/account/pay/${charge.id}`,
      });
      await notify(
        await customerTarget(job.customerId, { jobId }),
        "payment.action_required",
        msg,
        `payment.action_required:${charge.id}:${charge.attemptCount}`,
      );
    }
    return { status: "requires-action" };
  }
  if (res.code === "NO_CARD" || res.code === "STRIPE_ERROR") {
    const charge = await prisma.charge.findFirst({
      where: { jobId, type: "SERVICE" },
      orderBy: { createdAt: "desc" },
    });
    const attempt = charge?.attemptCount ?? 1;
    const delay = RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)];
    const final = attempt > RETRY_DELAYS_MS.length;
    if (charge)
      await prisma.charge.update({
        where: { id: charge.id },
        data: {
          nextRetryAt: final ? null : new Date(Date.now() + delay),
          status: final ? "FAILED_FINAL" : "FAILED",
        },
      });
    if (job.booking.frequency !== "ONE_TIME" && job.booking.status === "ACTIVE") {
      await prisma.booking.update({
        where: { id: job.bookingId },
        data: {
          status: "PAUSED",
          internalNotes:
            `${job.booking.internalNotes ?? ""}\nPaused: payment failed on ${when}.`.trim(),
        },
      });
    }
    const msg = paymentFailedTemplate({
      brand: brand(),
      firstName: job.customer.firstName,
      when,
      amountCents: (job.activeQuote?.totalCents ?? 0) + job.tipCents,
      reason: res.message,
      paymentUrl: `${appUrl()}/account/payment`,
    });
    await notify(
      await customerTarget(job.customerId, { jobId }),
      "payment.failed",
      msg,
      `payment.failed:${jobId}:${attempt}`,
    );
    return { status: final ? "failed-final" : "failed" };
  }
  return { status: `skipped:${res.code}` };
}

/** Retries FAILED service charges whose retry time has come. */
export async function runPaymentRetries(now = new Date()): Promise<{ retried: number }> {
  const due = await prisma.charge.findMany({
    where: {
      type: "SERVICE",
      jobId: { not: null },
      OR: [
        { status: "FAILED", nextRetryAt: { lte: now } },
        // Attempts whose outcome was never recorded (crash or network error): replaying them with
        // the same idempotency key reconciles with Stripe without charging twice.
        { status: "PENDING", updatedAt: { lt: new Date(now.getTime() - STALE_PENDING_MS) } },
      ],
    },
    select: { jobId: true },
  });
  let retried = 0;
  for (const c of due) {
    await chargeCompletedJob(c.jobId!);
    retried++;
  }
  return { retried };
}
