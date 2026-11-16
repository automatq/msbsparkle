import { prisma } from "@/modules/db/client";
import { hasRole } from "@/modules/auth/roles";
import { getOptionalCtx } from "@/modules/auth/session";
import { getStripe } from "./stripe";

/**
 * Whether the current request may manage this customer's profile and default card: staff, the
 * customer signed in as themselves, or a brand-new customer (no login, never booked) mid-checkout.
 */
export async function canActAsCustomer(customer: {
  id: string;
  userId: string | null;
}): Promise<boolean> {
  const ctx = await getOptionalCtx();
  if (ctx && hasRole(ctx.roles, "SUPER_ADMIN", "REGION_ADMIN")) return true;
  if (customer.userId) return ctx?.userId === customer.userId;
  return (await prisma.booking.count({ where: { customerId: customer.id } })) === 0;
}

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
  const existing = await prisma.customer.findUnique({
    where: { organizationId_email: { organizationId, email } },
  });
  // Public checkout identifies people only by the email they type. Unless the caller is that
  // customer (signed in) or staff, an existing customer's profile must not be changed.
  const mayUpdate = !existing || (await canActAsCustomer(existing));
  const customer = await prisma.customer.upsert({
    where: { organizationId_email: { organizationId, email } },
    update: mayUpdate
      ? { firstName: data.firstName, lastName: data.lastName, phone: data.phone ?? undefined }
      : {},
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
