import { prisma } from "@/modules/db/client";
import { getStripe } from "./stripe";

/** Upsert a guest Customer by org + email, and lazily create the Stripe customer. */
export async function ensureCustomer(
  organizationId: string,
  data: {
    email: string;
    firstName: string;
    lastName: string;
    phone?: string | null;
    source?: string;
  },
) {
  const email = data.email.toLowerCase();
  const customer = await prisma.customer.upsert({
    where: { organizationId_email: { organizationId, email } },
    update: { firstName: data.firstName, lastName: data.lastName, phone: data.phone ?? undefined },
    create: {
      organizationId,
      email,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone ?? null,
      source: data.source ?? "web",
    },
  });
  const stripe = getStripe();
  if (stripe && !customer.stripeCustomerId) {
    const sc = await stripe.customers.create(
      {
        email,
        name: `${data.firstName} ${data.lastName}`,
        phone: data.phone ?? undefined,
        metadata: { customerId: customer.id, organizationId },
      },
      { idempotencyKey: `customer:${customer.id}` },
    );
    return prisma.customer.update({
      where: { id: customer.id },
      data: { stripeCustomerId: sc.id },
    });
  }
  return customer;
}
