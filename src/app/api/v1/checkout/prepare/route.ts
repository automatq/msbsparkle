import { z } from "zod";
import { prisma } from "@/modules/db/client";
import { ensureCustomer } from "@/modules/payments/customers";
import { createSetupIntent } from "@/modules/payments/setup-intents";
import { isStripeConfigured } from "@/modules/payments/stripe";
import { withOrg } from "@/modules/shared/api/handlers";
import { fail, ok } from "@/modules/shared/api/response";

const schema = z.object({
  regionId: z.string().min(1),
  contact: z.object({
    firstName: z.string().trim().min(1).max(60),
    lastName: z.string().trim().min(1).max(60),
    email: z.string().trim().email(),
    phone: z.string().trim().min(7).max(20),
  }),
});

export function POST(req: Request) {
  return withOrg(req, async ({ organizationId }) => {
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("INVALID", 400, parsed.error.issues);

    const region = await prisma.region.findUnique({
      where: { id: parsed.data.regionId },
      select: { organizationId: true },
    });
    if (!region || region.organizationId !== organizationId) return fail("NOT_FOUND", 404);

    const customer = await ensureCustomer(organizationId, {
      ...parsed.data.contact,
      source: "web",
    });
    if (!isStripeConfigured())
      return ok({ customerId: customer.id, clientSecret: null, stripeConfigured: false });
    const si = await createSetupIntent(customer.stripeCustomerId!, customer.id);
    return ok({ customerId: customer.id, clientSecret: si.clientSecret, stripeConfigured: true });
  });
}
