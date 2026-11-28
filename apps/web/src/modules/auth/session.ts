import { redirect } from "next/navigation";
import { cache } from "react";
import type { Role } from "@/generated/prisma/enums";
import { prisma } from "@/modules/db/client";
import { auth } from "./config";
import { ForbiddenError, UnauthorizedError, type Ctx } from "./access";
import { hasRole, isSuperAdmin, scopedRegionIds } from "./roles";

export { ForbiddenError, UnauthorizedError, assertRegionAccess, type Ctx } from "./access";

/** One lookup per request, shared by the layout, the page and any actions it runs. */
const accountState = cache((userId: string) =>
  prisma.user.findUnique({
    where: { id: userId },
    select: { status: true, sessionVersion: true },
  }),
);

/**
 * The signed-in user, or null. The session cookie is a JWT whose roles are refreshed only every
 * 15 minutes, so on its own it would keep working after an admin was removed or a cleaner
 * suspended. Every request therefore re-checks the account: a disabled login, or one whose
 * `sessionVersion` moved on (access changed, password reset, signed out everywhere), is treated
 * as signed out at once.
 */
export async function getOptionalCtx(): Promise<Ctx | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const account = await accountState(session.user.id);
  if (!account || account.status === "DISABLED") return null;
  if (
    session.user.sessionVersion !== undefined &&
    session.user.sessionVersion !== account.sessionVersion
  )
    return null;
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
