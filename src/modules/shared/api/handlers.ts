import type { NextResponse } from "next/server";
import { ApiTokenError } from "@/modules/auth/api-tokens";
import { apiCustomerStorage } from "@/modules/customer/api-context";
import { requireApiCustomer, type ApiCustomerCtx } from "./customer-auth";
import { ApiKeyError, resolveOrgFromApiKey } from "./org";
import { fail } from "./response";

/** Resolves the tenant from X-Api-Key, or responds 401. */
export async function withOrg(
  req: Request,
  fn: (org: { organizationId: string; allowedOrigin: string | null }) => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    const org = await resolveOrgFromApiKey(req);
    return await fn(org);
  } catch (e) {
    if (e instanceof ApiKeyError) return fail("UNAUTHORIZED", 401);
    throw e;
  }
}

/**
 * Resolves the signed-in customer from the bearer access token, or responds 401. Runs `fn`
 * with that customer as the caller of any customer server action it invokes.
 */
export async function withApiCustomer(
  req: Request,
  fn: (ctx: ApiCustomerCtx) => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    const ctx = await requireApiCustomer(req);
    return await apiCustomerStorage.run(ctx.customer, () => fn(ctx));
  } catch (e) {
    if (e instanceof ApiTokenError) return fail("UNAUTHORIZED", 401);
    throw e;
  }
}
