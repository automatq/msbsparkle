import type Stripe from "stripe";
import type { Charge } from "@/generated/prisma/client";
import { prisma } from "@/modules/db/client";
import type { Actor } from "@/modules/jobs/state-machine";
import { getStripe } from "./stripe";
import { currency } from "@/modules/shared/country";

export type ChargeResult =
  | { ok: true; chargeId: string; status: string }
  | {
      ok: false;
      code:
        | "NO_QUOTE"
        | "NO_CARD"
        | "NOT_COMPLETED"
        | "ALREADY_PAID"
        | "IN_PROGRESS"
        | "REQUIRES_ACTION"
        | "STRIPE_ERROR"
        | "NO_STRIPE";
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
  const stripe = getStripe();
  const amount = job.activeQuote.totalCents + job.tipCents;
  const idempotencyKey = `job:${job.id}:service:${job.activeQuote.id}`;

  // A previous attempt may be waiting for the customer to confirm it (3D Secure). Settle that
  // PaymentIntent first: record it if the customer already paid, otherwise cancel it so it can
  // no longer be confirmed alongside the new attempt.
  if (stripe) {
    const waiting = await prisma.charge.findUnique({ where: { idempotencyKey } });
    if (waiting?.status === "REQUIRES_ACTION" && waiting.stripePaymentIntentId) {
      const settled = await settleWaitingIntent(stripe, waiting.stripePaymentIntentId);
      if (settled.status === "succeeded" || settled.status === "processing")
        return await recordIntentResult(waiting.id, job.id, settled, actor);
    }
  }

  const claim = await claimServiceCharge({
    idempotencyKey,
    amount,
    pmId: pm?.id ?? null,
    giftCardId: job.booking.giftCardId,
    create: {
      organizationId: job.organizationId,
      customerId: job.customerId,
      jobId: job.id,
      quoteId: job.activeQuote.id,
    },
  });
  if (!claim.ok) {
    if (claim.code === "ALREADY_PAID")
      await prisma.job.update({ where: { id: job.id }, data: { paymentStatus: "PAID" } });
    return claim;
  }
  const charge = claim.charge;
  if (charge.cardCents > 0 && !pm) {
    await releaseClaim(charge.id, "NO_CARD", "No card on file for this customer.");
    return { ok: false, code: "NO_CARD", message: "No card on file for this customer." };
  }
  if (charge.cardCents > 0 && !stripe) {
    await releaseClaim(charge.id, "NO_STRIPE", "Stripe is not configured.");
    return { ok: false, code: "NO_STRIPE", message: "Stripe is not configured." };
  }
  if (charge.cardCents === 0) {
    await prisma.charge.update({
      where: { id: charge.id },
      data: { status: "CAPTURED", capturedAt: new Date() },
    });
    await prisma.job.update({ where: { id: job.id }, data: { paymentStatus: "PAID" } });
    await prisma.jobEvent.create({
      data: {
        jobId: job.id,
        type: "PAYMENT",
        actorType: actor.type,
        actorId: actor.id ?? null,
        data: { chargeId: charge.id, status: "CAPTURED", giftCardCents: charge.giftCardCents },
      },
    });
    return { ok: true, chargeId: charge.id, status: "CAPTURED" };
  }
  // Charge the card recorded on the claimed row: a replayed attempt must send exactly the same
  // parameters as the original, or Stripe rejects the idempotency key.
  const chargePm = charge.paymentMethodId
    ? await prisma.paymentMethod.findUnique({ where: { id: charge.paymentMethodId } })
    : null;
  if (!stripe || !chargePm) {
    await releaseClaim(charge.id, "NO_CARD", "No card on file for this customer.");
    return { ok: false, code: "NO_CARD", message: "No card on file for this customer." };
  }

  try {
    const pi = await stripe.paymentIntents.create(
      {
        amount: charge.cardCents,
        currency: currency.toLowerCase(),
        customer: job.customer.stripeCustomerId!,
        payment_method: chargePm.stripePaymentMethodId,
        off_session: true,
        confirm: true,
        description: `Cleaning ${job.id}`,
        metadata: { chargeId: charge.id, jobId: job.id, customerId: job.customerId },
      },
      // Same key for a replayed attempt, so Stripe returns the original outcome instead of
      // charging again; a new key only after the previous attempt definitively failed.
      { idempotencyKey: `${idempotencyKey}:attempt:${charge.attemptCount}` },
    );
    return await recordIntentResult(charge.id, job.id, pi, actor);
  } catch (e) {
    const err = e as Stripe.errors.StripeError & { payment_intent?: Stripe.PaymentIntent };
    if (err.payment_intent)
      return await recordIntentResult(charge.id, job.id, err.payment_intent, actor, err);
    if (isOutcomeUnknown(err)) {
      // The request may have reached Stripe. Leave the charge PENDING: once stale, the next
      // claim replays this attempt with the same idempotency key and learns the real outcome.
      return {
        ok: false,
        code: "IN_PROGRESS",
        message: "Payment outcome is not confirmed yet; it will be checked again shortly.",
      };
    }
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

/** A PENDING charge untouched for this long is assumed to belong to a crashed attempt. */
export const STALE_PENDING_MS = 5 * 60 * 1000;
/** Statuses after which a fresh attempt (new Stripe idempotency key) is safe. */
const RETRYABLE = ["FAILED", "FAILED_FINAL", "REQUIRES_ACTION", "CANCELED"] as const;

type ClaimResult =
  | { ok: true; charge: Charge }
  | { ok: false; code: "ALREADY_PAID" | "IN_PROGRESS"; message: string };

/**
 * Takes exclusive ownership of the service charge for one attempt. Only one caller can hold a
 * charge in PENDING at a time, so concurrent "charge now" clicks, cron runs and Inngest retries
 * cannot each create a PaymentIntent.
 * - No row yet: create it (the unique idempotency key settles creation races) and apply any gift
 *   card balance once.
 * - Previous attempt definitively failed: start a new attempt with the current amount, so a tip
 *   added since is included.
 * - Previous attempt stuck in PENDING (process died mid-call): replay the same attempt number, so
 *   Stripe's idempotency returns that attempt's real outcome rather than charging twice.
 */
export async function claimServiceCharge(input: {
  idempotencyKey: string;
  amount: number;
  pmId: string | null;
  giftCardId: string | null;
  create: { organizationId: string; customerId: string; jobId: string; quoteId: string };
  now?: Date;
}): Promise<ClaimResult> {
  const now = input.now ?? new Date();
  const existing = await prisma.charge.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });

  if (!existing) {
    try {
      const charge = await prisma.$transaction(async (tx) => {
        let giftCardCents = 0;
        const gc = input.giftCardId
          ? await tx.giftCard.findUnique({ where: { id: input.giftCardId } })
          : null;
        if (gc && gc.status === "ACTIVE" && gc.balanceCents > 0)
          giftCardCents = Math.min(gc.balanceCents, input.amount);
        const created = await tx.charge.create({
          data: {
            ...input.create,
            type: "SERVICE",
            amountCents: input.amount,
            giftCardCents,
            cardCents: input.amount - giftCardCents,
            paymentMethodId: input.pmId,
            idempotencyKey: input.idempotencyKey,
            attemptCount: 1,
            status: "PENDING",
          },
        });
        if (gc && giftCardCents > 0) {
          const updated = await tx.giftCard.update({
            where: { id: gc.id },
            data: { balanceCents: { decrement: giftCardCents } },
          });
          if (updated.balanceCents < 0) throw new Error("Gift card balance changed; try again.");
          if (updated.balanceCents === 0)
            await tx.giftCard.update({ where: { id: gc.id }, data: { status: "DEPLETED" } });
          await tx.giftCardRedemption.create({
            data: { giftCardId: gc.id, chargeId: created.id, amountCents: giftCardCents },
          });
        }
        return created;
      });
      return { ok: true, charge };
    } catch (e) {
      if (isUniqueViolation(e))
        return {
          ok: false,
          code: "IN_PROGRESS",
          message: "A charge for this visit is in progress.",
        };
      throw e;
    }
  }

  if (
    ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED", "DISPUTED", "AUTHORIZED"].includes(
      existing.status,
    )
  )
    return { ok: false, code: "ALREADY_PAID", message: "Already paid." };
  if (existing.status === "WAIVED")
    return { ok: false, code: "ALREADY_PAID", message: "Payment was waived." };

  if ((RETRYABLE as readonly string[]).includes(existing.status)) {
    const cardCents = Math.max(0, input.amount - existing.giftCardCents);
    const { count } = await prisma.charge.updateMany({
      where: { id: existing.id, status: existing.status, attemptCount: existing.attemptCount },
      data: {
        status: "PENDING",
        attemptCount: { increment: 1 },
        amountCents: input.amount,
        cardCents,
        paymentMethodId: input.pmId,
        failureCode: null,
        failureMessage: null,
        nextRetryAt: null,
      },
    });
    if (count === 0)
      return { ok: false, code: "IN_PROGRESS", message: "A charge for this visit is in progress." };
    return {
      ok: true,
      charge: await prisma.charge.findUniqueOrThrow({ where: { id: existing.id } }),
    };
  }

  // PENDING: someone else is mid-attempt unless it has gone stale.
  if (now.getTime() - existing.updatedAt.getTime() < STALE_PENDING_MS)
    return { ok: false, code: "IN_PROGRESS", message: "A charge for this visit is in progress." };
  const { count } = await prisma.charge.updateMany({
    where: { id: existing.id, status: "PENDING", updatedAt: existing.updatedAt },
    data: { updatedAt: now },
  });
  if (count === 0)
    return { ok: false, code: "IN_PROGRESS", message: "A charge for this visit is in progress." };
  return {
    ok: true,
    charge: await prisma.charge.findUniqueOrThrow({ where: { id: existing.id } }),
  };
}

async function settleWaitingIntent(stripe: Stripe, piId: string): Promise<Stripe.PaymentIntent> {
  const pi = await stripe.paymentIntents.retrieve(piId);
  if (["succeeded", "processing", "canceled"].includes(pi.status)) return pi;
  try {
    return await stripe.paymentIntents.cancel(piId);
  } catch {
    // Lost a race with the customer confirming it: report whatever it is now.
    return await stripe.paymentIntents.retrieve(piId);
  }
}

/** Ends a claimed attempt that never reached Stripe, so it can be retried later. */
async function releaseClaim(chargeId: string, code: string, message: string) {
  await prisma.charge.update({
    where: { id: chargeId },
    data: { status: "FAILED", failureCode: code, failureMessage: message },
  });
}

/**
 * Maps a PaymentIntent to our charge status. Off-session charges that need 3D Secure come back
 * as `requires_action`, or fail with `authentication_required` (status `requires_payment_method`);
 * both need the customer to confirm on-session rather than an automatic retry.
 */
export function intentChargeStatus(
  pi: Pick<Stripe.PaymentIntent, "status" | "last_payment_error">,
  errorCode?: string,
): "CAPTURED" | "PENDING" | "REQUIRES_ACTION" | "CANCELED" | "FAILED" {
  if (pi.status === "succeeded") return "CAPTURED";
  if (pi.status === "processing") return "PENDING";
  if (pi.status === "canceled") return "CANCELED";
  if (
    pi.status === "requires_action" ||
    pi.last_payment_error?.code === "authentication_required" ||
    errorCode === "authentication_required"
  )
    return "REQUIRES_ACTION";
  return "FAILED";
}

/** Network failures and Stripe-side errors where the charge may or may not have happened. */
function isOutcomeUnknown(err: Stripe.errors.StripeError): boolean {
  return (
    err.type === "StripeConnectionError" ||
    err.type === "StripeAPIError" ||
    err.type === "StripeRateLimitError" ||
    (typeof err.statusCode === "number" && err.statusCode >= 500) ||
    err.statusCode === undefined
  );
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

export async function recordIntentResult(
  chargeId: string,
  jobId: string,
  pi: Stripe.PaymentIntent,
  actor: Actor,
  err?: Stripe.errors.StripeError,
): Promise<ChargeResult> {
  const status = intentChargeStatus(pi, err?.code);
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
  if (status === "PENDING")
    return { ok: false, code: "IN_PROGRESS", message: "The payment is still processing." };
  if (status === "REQUIRES_ACTION")
    return {
      ok: false,
      code: "REQUIRES_ACTION",
      message: "The bank asked the customer to confirm this payment.",
    };
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
