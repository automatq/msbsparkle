import type Stripe from "stripe";
import { prisma } from "@/modules/db/client";
import type { Actor } from "@/modules/jobs/state-machine";
import { getStripe } from "./stripe";

export type ChargeResult =
  | { ok: true; chargeId: string; status: string }
  | {
      ok: false;
      code:
        "NO_QUOTE" | "NO_CARD" | "NOT_COMPLETED" | "ALREADY_PAID" | "STRIPE_ERROR" | "NO_STRIPE";
      message: string;
    };

/**
 * Charges the customer's saved card for a completed job (service total + tip).
 * Idempotent per (job, quote): re-running reuses the same Charge row and Stripe idempotency key.
 */
export async function createServiceCharge(
  jobId: string,
  actor: Actor,
  opts: { force?: boolean } = {},
): Promise<ChargeResult> {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: {
      activeQuote: true,
      customer: { include: { paymentMethods: { where: { status: "ACTIVE" } } } },
      booking: { include: { paymentMethod: true } },
    },
  });
  if (job.status !== "COMPLETED" && !opts.force)
    return { ok: false, code: "NOT_COMPLETED", message: "Job is not completed yet." };
  if (job.paymentStatus === "PAID")
    return { ok: false, code: "ALREADY_PAID", message: "Already paid." };
  if (!job.activeQuote) return { ok: false, code: "NO_QUOTE", message: "Job has no price." };
  const pm =
    job.booking.paymentMethod ??
    job.customer.paymentMethods.find((p) => p.id === job.customer.defaultPaymentMethodId) ??
    job.customer.paymentMethods[0];
  if (!pm) return { ok: false, code: "NO_CARD", message: "No card on file for this customer." };
  const stripe = getStripe();
  if (!stripe) return { ok: false, code: "NO_STRIPE", message: "Stripe is not configured." };

  const amount = job.activeQuote.totalCents + job.tipCents;
  const idempotencyKey = `job:${job.id}:service:${job.activeQuote.id}`;
  const charge = await prisma.charge.upsert({
    where: { idempotencyKey },
    update: {
      attemptCount: { increment: 1 },
      status: "PENDING",
      failureCode: null,
      failureMessage: null,
    },
    create: {
      organizationId: job.organizationId,
      customerId: job.customerId,
      jobId: job.id,
      type: "SERVICE",
      quoteId: job.activeQuote.id,
      amountCents: amount,
      cardCents: amount,
      paymentMethodId: pm.id,
      idempotencyKey,
      attemptCount: 1,
    },
  });

  try {
    const pi = await stripe.paymentIntents.create(
      {
        amount,
        currency: "cad",
        customer: job.customer.stripeCustomerId!,
        payment_method: pm.stripePaymentMethodId,
        off_session: true,
        confirm: true,
        description: `Cleaning ${job.booking ? "" : ""}${job.id}`,
        metadata: { chargeId: charge.id, jobId: job.id, customerId: job.customerId },
      },
      { idempotencyKey: `${idempotencyKey}:attempt:${charge.attemptCount}` },
    );
    return await recordIntentResult(charge.id, job.id, pi, actor);
  } catch (e) {
    const err = e as Stripe.errors.StripeError & { payment_intent?: Stripe.PaymentIntent };
    if (err.payment_intent)
      return await recordIntentResult(charge.id, job.id, err.payment_intent, actor, err);
    await prisma.charge.update({
      where: { id: charge.id },
      data: { status: "FAILED", failureCode: err.code ?? "unknown", failureMessage: err.message },
    });
    await prisma.job.update({ where: { id: job.id }, data: { paymentStatus: "FAILED" } });
    await prisma.jobEvent.create({
      data: {
        jobId: job.id,
        type: "PAYMENT",
        actorType: actor.type,
        actorId: actor.id ?? null,
        data: { chargeId: charge.id, status: "FAILED", error: err.message },
      },
    });
    return { ok: false, code: "STRIPE_ERROR", message: err.message };
  }
}

async function recordIntentResult(
  chargeId: string,
  jobId: string,
  pi: Stripe.PaymentIntent,
  actor: Actor,
  err?: Stripe.errors.StripeError,
): Promise<ChargeResult> {
  const status =
    pi.status === "succeeded"
      ? "CAPTURED"
      : pi.status === "requires_action"
        ? "REQUIRES_ACTION"
        : pi.status === "canceled"
          ? "CANCELED"
          : "FAILED";
  await prisma.charge.update({
    where: { id: chargeId },
    data: {
      stripePaymentIntentId: pi.id,
      stripeChargeId: typeof pi.latest_charge === "string" ? pi.latest_charge : null,
      status,
      capturedAt: status === "CAPTURED" ? new Date() : null,
      failureCode: status === "FAILED" ? (pi.last_payment_error?.code ?? err?.code ?? null) : null,
      failureMessage:
        status === "FAILED" ? (pi.last_payment_error?.message ?? err?.message ?? null) : null,
    },
  });
  await prisma.job.update({
    where: { id: jobId },
    data: {
      paymentStatus: status === "CAPTURED" ? "PAID" : status === "FAILED" ? "FAILED" : "UNPAID",
    },
  });
  await prisma.jobEvent.create({
    data: {
      jobId,
      type: "PAYMENT",
      actorType: actor.type,
      actorId: actor.id ?? null,
      data: { chargeId, status, paymentIntentId: pi.id },
    },
  });
  if (status === "CAPTURED") return { ok: true, chargeId, status };
  return {
    ok: false,
    code: "STRIPE_ERROR",
    message: pi.last_payment_error?.message ?? err?.message ?? `Payment ${pi.status}`,
  };
}

export async function refundCharge(
  chargeId: string,
  amountCents: number,
  reason: "QUALITY" | "CANCELLED" | "DUPLICATE" | "GOODWILL" | "OTHER",
  note: string | null,
  actor: Actor,
) {
  const charge = await prisma.charge.findUniqueOrThrow({
    where: { id: chargeId },
    include: { refunds: true },
  });
  if (!["CAPTURED", "PARTIALLY_REFUNDED"].includes(charge.status))
    return { ok: false as const, message: "Only captured charges can be refunded." };
  const refunded = charge.refunds
    .filter((r) => r.status === "SUCCEEDED")
    .reduce((s, r) => s + r.amountCents, 0);
  if (amountCents <= 0 || amountCents + refunded > charge.cardCents)
    return { ok: false as const, message: "Refund exceeds the remaining amount." };
  const stripe = getStripe();
  if (!stripe || !charge.stripePaymentIntentId)
    return { ok: false as const, message: "Stripe is not configured." };
  const refund = await prisma.refund.create({
    data: { chargeId, amountCents, reason, note, createdByUserId: actor.id ?? null },
  });
  try {
    const sr = await stripe.refunds.create(
      {
        payment_intent: charge.stripePaymentIntentId,
        amount: amountCents,
        metadata: { refundId: refund.id },
      },
      { idempotencyKey: `refund:${refund.id}` },
    );
    const full = refunded + amountCents >= charge.cardCents;
    await prisma.$transaction([
      prisma.refund.update({
        where: { id: refund.id },
        data: { stripeRefundId: sr.id, status: "SUCCEEDED" },
      }),
      prisma.charge.update({
        where: { id: chargeId },
        data: { status: full ? "REFUNDED" : "PARTIALLY_REFUNDED" },
      }),
      ...(charge.jobId
        ? [
            prisma.job.update({
              where: { id: charge.jobId },
              data: { paymentStatus: full ? "REFUNDED" : "PARTIALLY_REFUNDED" },
            }),
          ]
        : []),
    ]);
    if (charge.jobId)
      await prisma.jobEvent.create({
        data: {
          jobId: charge.jobId,
          type: "PAYMENT",
          actorType: actor.type,
          actorId: actor.id ?? null,
          data: { refundId: refund.id, amountCents, reason },
        },
      });
    return { ok: true as const, refundId: refund.id };
  } catch (e) {
    await prisma.refund.update({ where: { id: refund.id }, data: { status: "FAILED" } });
    return { ok: false as const, message: e instanceof Error ? e.message : "Refund failed" };
  }
}

/** Marks a job as not to be charged (goodwill, comp, or paid outside the system). */
export async function waiveJobPayment(jobId: string, actor: Actor, note: string) {
  await prisma.$transaction(async (tx) => {
    await tx.job.update({ where: { id: jobId }, data: { paymentStatus: "WAIVED" } });
    await tx.charge.updateMany({
      where: {
        jobId,
        type: "SERVICE",
        status: { in: ["PENDING", "FAILED", "FAILED_FINAL", "REQUIRES_ACTION"] },
      },
      data: { status: "WAIVED" },
    });
    await tx.jobEvent.create({
      data: {
        jobId,
        type: "PAYMENT",
        actorType: actor.type,
        actorId: actor.id ?? null,
        data: { waived: true, note },
      },
    });
  });
}
