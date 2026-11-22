/**
 * Who is acting and what they may touch. Kept free of Auth.js / Next.js imports so domain
 * modules (and their tests) can enforce access without loading the session machinery;
 * `session.ts` builds a {@link Ctx} from the signed-in user and re-exports everything here.
 */
import type { RoleClaim } from "./roles";

export type Ctx = {
  orgId: string;
  userId: string;
  email: string;
  roles: RoleClaim[];
  /** Empty means unrestricted (super admin). */
  regionIds: string[];
  isSuperAdmin: boolean;
};

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
  }
}
export class ForbiddenError extends Error {
  constructor(msg = "Forbidden") {
    super(msg);
  }
}

export function assertRegionAccess(
  ctx: Pick<Ctx, "isSuperAdmin" | "regionIds">,
  regionId: string,
): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.regionIds.includes(regionId)) throw new ForbiddenError("No access to this region");
}
