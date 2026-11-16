import { BookingWizard } from "@/components/booking/booking-wizard";
import { requireRole } from "@/modules/auth/session";
import { prisma } from "@/modules/db/client";

export const dynamic = "force-dynamic";

/** Phone / walk-in orders: same wizard, no card step, source = ADMIN. */
export default async function NewBookingPage() {
  const ctx = await requireRole("/admin/login", "SUPER_ADMIN", "REGION_ADMIN");
  const [services, extras] = await Promise.all([
    prisma.service.findMany({
      where: { organizationId: ctx.orgId, active: true },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        pricingModel: true,
        isUpgrade: true,
      },
    }),
    prisma.extra.findMany({
      where: { organizationId: ctx.orgId, active: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, slug: true, name: true, unit: true, maxQty: true },
    }),
  ]);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">New booking (phone order)</h1>
      <BookingWizard services={services} extras={extras} adminMode />
    </div>
  );
}
