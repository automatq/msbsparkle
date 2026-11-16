import type { Ctx } from "@/modules/auth/session";

/** Spread into Prisma `where` for any model with a `regionId` column. */
export function regionWhere(ctx: Ctx): { regionId?: { in: string[] } } {
  if (ctx.isSuperAdmin) return {};
  return { regionId: { in: ctx.regionIds } };
}
