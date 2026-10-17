import { prisma } from "@/modules/db/client";
import { withOrg } from "@/modules/shared/api/handlers";
import { ok } from "@/modules/shared/api/response";

export function GET(req: Request) {
  return withOrg(req, async ({ organizationId }) => {
    const [services, extras] = await Promise.all([
      prisma.service.findMany({
        where: { organizationId, active: true },
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
        where: { organizationId, active: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true, slug: true, name: true, unit: true, maxQty: true },
      }),
    ]);
    return ok({ services, extras });
  });
}
