import type { Ctx } from "@/modules/auth/session";
import { prisma } from "@/modules/db/client";

/** Regions visible to this admin, ordered by name. */
export async function visibleRegions(ctx: Ctx) {
  return prisma.region.findMany({
    where: {
      organizationId: ctx.orgId,
      ...(ctx.isSuperAdmin ? {} : { id: { in: ctx.regionIds } }),
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true, province: true, timezone: true, status: true },
  });
}

/** Resolve the selected region from a query param, falling back to the first visible one. */
export async function pickRegion(ctx: Ctx, requested?: string | null) {
  const regions = await visibleRegions(ctx);
  const region = regions.find((r) => r.id === requested) ?? regions[0] ?? null;
  return { regions, region };
}

/** Region with the most non-cancelled jobs in the week starting `date`, else first visible. */
export async function pickRegionForDate(
  ctx: Ctx,
  requested: string | null | undefined,
  date: Date,
) {
  const regions = await visibleRegions(ctx);
  let region = regions.find((r) => r.id === requested) ?? null;
  if (!region && regions.length) {
    const counts = await prisma.job.groupBy({
      by: ["regionId"],
      where: {
        regionId: { in: regions.map((r) => r.id) },
        scheduledDate: { gte: date, lte: new Date(date.getTime() + 7 * 86_400_000) },
        status: { notIn: ["CANCELLED", "SKIPPED"] },
      },
      _count: { _all: true },
      orderBy: { _count: { regionId: "desc" } },
      take: 1,
    });
    region = regions.find((r) => r.id === counts[0]?.regionId) ?? regions[0];
  }
  return { regions, region };
}
