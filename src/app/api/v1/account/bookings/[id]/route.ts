import { bookingSelect, visitSelect } from "@/modules/customer/api-views";
import { prisma } from "@/modules/db/client";
import { withApiCustomer } from "@/modules/shared/api/handlers";
import { fail, ok } from "@/modules/shared/api/response";

export function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiCustomer(req, async ({ customerId }) => {
    const { id } = await params;
    const booking = await prisma.booking.findFirst({
      where: { id, customerId },
      select: {
        ...bookingSelect,
        organizationId: true,
        jobs: { orderBy: { sequenceNumber: "asc" }, select: visitSelect },
      },
    });
    if (!booking) return fail("NOT_FOUND", 404);
    const { organizationId, ...rest } = booking;
    // What a plan editor needs to offer: the region's windows and the org's extras.
    const [windows, extrasCatalog] = await Promise.all([
      prisma.arrivalWindow.findMany({
        where: { regionId: booking.regionId, active: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true, label: true, startLocal: true, endLocal: true },
      }),
      prisma.extra.findMany({
        where: { organizationId, active: true },
        orderBy: { sortOrder: "asc" },
        select: { slug: true, name: true, maxQty: true },
      }),
    ]);
    return ok({ booking: rest, windows, extrasCatalog });
  });
}
