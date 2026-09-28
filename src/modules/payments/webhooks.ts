import type Stripe from "stripe";
import { prisma } from "@/modules/db/client";
import { issueGiftCard } from "@/modules/gift-cards/service";

/** Reconcile local state from Stripe events. Handlers must be idempotent. */
export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "setup_intent.succeeded": {
      const si = event.data.object;
      const customerId = si.metadata?.customerId;
      const pmId =
        typeof si.payment_method === "string" ? si.payment_method : si.payment_method?.id;
      if (!customerId || !pmId) return;
      const existing = await prisma.paymentMethod.findUnique({
        where: { stripePaymentMethodId: pmId },
      });
      if (!existing) {
        await prisma.paymentMethod.create({
          data: {
            customerId,
            stripePaymentMethodId: pmId,
            brand: "card",
            last4: "????",
            expMonth: 0,
            expYear: 0,
          },
        });
      }
      return;
    }
    case "payment_method.detached": {
      const pm = event.data.object;
      await prisma.paymentMethod.updateMany({
        where: { stripePaymentMethodId: pm.id },
        data: { status: "DETACHED" },
      });
      return;
    }
    case "payment_intent.succeeded":
    case "payment_intent.payment_failed":
    case "payment_intent.canceled": {
      const pi = event.data.object;
      const charge = await prisma.charge.findUnique({ where: { stripePaymentIntentId: pi.id } });
      if (!charge) return; // may arrive before our row commits; the primary flow sets status too.
      const status =
        event.type === "payment_intent.succeeded"
          ? "CAPTURED"
          : event.type === "payment_intent.canceled"
            ? "CANCELED"
            : "FAILED";
      await prisma.charge.update({
        where: { id: charge.id },
        data: {
          status,
          capturedAt: status === "CAPTURED" ? new Date() : undefined,
          stripeChargeId: typeof pi.latest_charge === "string" ? pi.latest_charge : undefined,
          failureCode: pi.last_payment_error?.code ?? undefined,
          failureMessage: pi.last_payment_error?.message ?? undefined,
        },
      });
      if (charge.jobId && charge.type === "SERVICE") {
        await prisma.job.update({
          where: { id: charge.jobId },
          data: {
            paymentStatus:
              status === "CAPTURED" ? "PAID" : status === "FAILED" ? "FAILED" : undefined,
          },
        });
      }
      return;
    }
    case "charge.refunded": {
      const ch = event.data.object;
      const piId =
        typeof ch.payment_intent === "string" ? ch.payment_intent : ch.payment_intent?.id;
      if (!piId) return;
      const charge = await prisma.charge.findUnique({ where: { stripePaymentIntentId: piId } });
      if (!charge) return;
      const full = ch.amount_refunded >= ch.amount;
      await prisma.charge.update({
        where: { id: charge.id },
        data: { status: full ? "REFUNDED" : "PARTIALLY_REFUNDED" },
      });
      if (charge.jobId)
        await prisma.job.update({
          where: { id: charge.jobId },
          data: { paymentStatus: full ? "REFUNDED" : "PARTIALLY_REFUNDED" },
        });
      return;
    }
    case "charge.dispute.created": {
      const d = event.data.object;
      const piId = typeof d.payment_intent === "string" ? d.payment_intent : d.payment_intent?.id;
      if (!piId) return;
      await prisma.charge.updateMany({
        where: { stripePaymentIntentId: piId },
        data: { status: "DISPUTED" },
      });
      return;
    }
    case "checkout.session.completed": {
      const cs = event.data.object;
      const m = cs.metadata ?? {};
      if (m.kind !== "GIFT_CARD" || cs.payment_status !== "paid") return;
      if (await prisma.giftCard.findFirst({ where: { purchaseChargeId: cs.id } })) return;
      await issueGiftCard({
        organizationId: m.organizationId,
        amountCents: Number(m.amountCents),
        purchaserEmail: m.purchaserEmail || cs.customer_email || "",
        recipientEmail: m.recipientEmail || null,
        message: m.message || null,
        purchaseChargeId: cs.id,
      });
      return;
    }
    default:
      return;
  }
}
