import { startAddCardAction } from "@/modules/customer/actions";
import { prisma } from "@/modules/db/client";
import { withApiCustomer } from "@/modules/shared/api/handlers";
import { fail, ok } from "@/modules/shared/api/response";

export function GET(req: Request) {
  return withApiCustomer(req, async ({ customer }) => {
    const cards = await prisma.paymentMethod.findMany({
      where: { customerId: customer.id, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      select: { id: true, brand: true, last4: true, expMonth: true, expYear: true },
    });
    return ok({
      cards: cards.map((c) => ({ ...c, isDefault: c.id === customer.defaultPaymentMethodId })),
    });
  });
}

/** Starts adding a card: returns a SetupIntent client secret for Stripe Elements. */
export function POST(req: Request) {
  return withApiCustomer(req, async () => {
    const r = await startAddCardAction();
    return r.ok
      ? ok({ clientSecret: r.clientSecret })
      : fail("ACTION_FAILED", 422, { message: r.message });
  });
}
