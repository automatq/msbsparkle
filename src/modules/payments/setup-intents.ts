import { prisma } from "@/modules/db/client";
import { requireStripe } from "./stripe";

export async function createSetupIntent(stripeCustomerId: string, customerId: string) {
  const stripe = requireStripe();
  const si = await stripe.setupIntents.create({
    customer: stripeCustomerId,
    usage: "off_session",
    payment_method_types: ["card"],
    metadata: { customerId },
  });
  return { id: si.id, clientSecret: si.client_secret! };
}

/** Verifies a succeeded SetupIntent for this customer and records/attaches the card as default. */
export async function verifyAndAttachSetupIntent(setupIntentId: string, customerId: string) {
  const stripe = requireStripe();
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
  const si = await stripe.setupIntents.retrieve(setupIntentId, { expand: ["payment_method"] });
  if (si.status !== "succeeded") throw new Error(`SetupIntent not succeeded (${si.status})`);
  if (si.customer !== customer.stripeCustomerId) throw new Error("SetupIntent customer mismatch");
  const pm =
    typeof si.payment_method === "string"
      ? await stripe.paymentMethods.retrieve(si.payment_method)
      : si.payment_method;
  if (!pm) throw new Error("SetupIntent has no payment method");
  await stripe.customers.update(customer.stripeCustomerId!, {
    invoice_settings: { default_payment_method: pm.id },
  });
  const record = await prisma.paymentMethod.upsert({
    where: { stripePaymentMethodId: pm.id },
    update: { status: "ACTIVE" },
    create: {
      customerId,
      stripePaymentMethodId: pm.id,
      brand: pm.card?.brand ?? "card",
      last4: pm.card?.last4 ?? "0000",
      expMonth: pm.card?.exp_month ?? 0,
      expYear: pm.card?.exp_year ?? 0,
    },
  });
  await prisma.customer.update({
    where: { id: customerId },
    data: { defaultPaymentMethodId: record.id },
  });
  return record;
}
