import { redirect } from "next/navigation";
import type { Role } from "@/generated/prisma/enums";
import { auth } from "./config";
import { ForbiddenError, UnauthorizedError, type Ctx } from "./access";
import { hasRole, isSuperAdmin, scopedRegionIds } from "./roles";

export { ForbiddenError, UnauthorizedError, assertRegionAccess, type Ctx } from "./access";

export async function getOptionalCtx(): Promise<Ctx | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const roles = session.user.roles ?? [];
  return {
    orgId: session.user.orgId,
    userId: session.user.id,
    email: session.user.email,
    roles,
    regionIds: scopedRegionIds(roles),
    isSuperAdmin: isSuperAdmin(roles),
  };
}

/** For Server Actions and Route Handlers: throws instead of redirecting. */
export async function getCtx(...allowed: Role[]): Promise<Ctx> {
  const ctx = await getOptionalCtx();
  if (!ctx) throw new UnauthorizedError();
  if (allowed.length && !hasRole(ctx.roles, ...allowed)) throw new ForbiddenError();
  return ctx;
}

/** For layouts and pages: redirects to the right login when not allowed. */
export async function requireRole(loginPath: string, ...allowed: Role[]): Promise<Ctx> {
  const ctx = await getOptionalCtx();
  if (!ctx) redirect(loginPath);
  if (allowed.length && !hasRole(ctx.roles, ...allowed)) redirect("/");
  return ctx;
}
