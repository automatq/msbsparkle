import { updateProfileAction } from "@/modules/customer/actions";
import { prisma } from "@/modules/db/client";
import { withApiCustomer } from "@/modules/shared/api/handlers";
import { fromAction, jsonBody, ok } from "@/modules/shared/api/response";

export function GET(req: Request) {
  return withApiCustomer(req, async ({ customer }) => {
    const addresses = await prisma.address.findMany({
      where: { customerId: customer.id, archivedAt: null },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        line1: true,
        line2: true,
        city: true,
        province: true,
        postalCode: true,
        entryInstructions: true,
        parkingInstructions: true,
        pets: true,
        isDefault: true,
      },
    });
    return ok({
      id: customer.id,
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      phone: customer.phone,
      marketingOptIn: customer.marketingOptIn,
      smsOptOut: customer.smsOptOut,
      defaultPaymentMethodId: customer.defaultPaymentMethodId,
      addresses,
    });
  });
}

/** Body: { firstName, lastName, phone, marketingOptIn, smsOptOut } (all required). */
export function PATCH(req: Request) {
  return withApiCustomer(req, async () =>
    fromAction(await updateProfileAction((await jsonBody(req)) as never)),
  );
}
