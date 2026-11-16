"use server";

import { revalidatePath } from "next/cache";
import type Stripe from "stripe";
import { getCtx } from "@/modules/auth/session";
import { customerForCtx } from "@/modules/customer/queries";
import { prisma } from "@/modules/db/client";
import { recordIntentResult } from "@/modules/payments/charges";
import { getStripe } from "@/modules/payments/stripe";

type Confirmation =
  | { ok: true; clientSecret: string; paymentMethodId: string | null }
  | { ok: false; message: string };

async function ownedWaitingCharge(chargeId: string) {
  const ctx = await getCtx();
  const customer = await customerForCtx(ctx);
  const charge = await prisma.charge.findFirst({
    where: { id: chargeId, customerId: customer.id },
  });
  return { customer, charge };
}

function pmId(pi: Stripe.PaymentIntent): string | null {
  const pm = pi.payment_method ?? pi.last_payment_error?.payment_method ?? null;
  return typeof pm === "string" ? pm : (pm?.id ?? null);
}

/** Hands the customer the PaymentIntent their bank wants confirmed (3D Secure). */
export async function startPaymentConfirmationAction(chargeId: string): Promise<Confirmation> {
  try {
    const { charge } = await ownedWaitingCharge(chargeId);
    if (!charge) return { ok: false, message: "Payment not found." };
    if (charge.status !== "REQUIRES_ACTION" || !charge.stripePaymentIntentId)
      return { ok: false, message: "This payment no longer needs confirming." };
    const stripe = getStripe();
    if (!stripe) return { ok: false, message: "Payments are not available right now." };
    const pi = await stripe.paymentIntents.retrieve(charge.stripePaymentIntentId);
    if (!pi.client_secret || ["succeeded", "canceled", "processing"].includes(pi.status))
      return { ok: false, message: "This payment no longer needs confirming." };
    return { ok: true, clientSecret: pi.client_secret, paymentMethodId: pmId(pi) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Something went wrong" };
  }
}

/** Records the outcome after the customer finished confirming in the browser. */
export async function finishPaymentConfirmationAction(
  chargeId: string,
): Promise<{ ok: true; paid: boolean } | { ok: false; message: string }> {
  try {
    const { customer, charge } = await ownedWaitingCharge(chargeId);
    if (!charge?.stripePaymentIntentId || !charge.jobId)
      return { ok: false, message: "Payment not found." };
    const stripe = getStripe();
    if (!stripe) return { ok: false, message: "Payments are not available right now." };
    if (charge.status === "CAPTURED") return { ok: true, paid: true };
    const pi = await stripe.paymentIntents.retrieve(charge.stripePaymentIntentId);
    const res = await recordIntentResult(charge.id, charge.jobId, pi, {
      type: "CUSTOMER",
      id: customer.id,
    });
    revalidatePath("/account");
    revalidatePath("/account/payment");
    return { ok: true, paid: res.ok };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Something went wrong" };
  }
}
