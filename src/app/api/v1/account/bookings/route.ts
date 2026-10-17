import { bookingSelect, visitSelect } from "@/modules/customer/api-views";
import { prisma } from "@/modules/db/client";
import { withApiCustomer } from "@/modules/shared/api/handlers";
import { ok } from "@/modules/shared/api/response";

/** Everything the account home needs: the customer's bookings and their non-cancelled visits. */
export function GET(req: Request) {
  return withApiCustomer(req, async ({ customerId }) => {
    const [bookings, visits] = await Promise.all([
      prisma.booking.findMany({
        where: { customerId },
        orderBy: { createdAt: "desc" },
        select: bookingSelect,
      }),
      prisma.job.findMany({
        where: { customerId, status: { notIn: ["CANCELLED", "SKIPPED"] } },
        orderBy: { scheduledStartAt: "asc" },
        select: visitSelect,
      }),
    ]);
    return ok({ bookings, visits });
  });
}
