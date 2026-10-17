import { prisma } from "@/modules/db/client";
import { ApiTokenError, verifyAccessToken } from "@/modules/auth/api-tokens";
import { customerForCtx } from "@/modules/customer/queries";

export type ApiCustomerCtx = {
  customerId: string;
  userId: string;
  organizationId: string;
  customer: Awaited<ReturnType<typeof customerForCtx>>;
};

/** Verifies the bearer access token for an authenticated /api/v1/account/* request. */
export async function requireApiCustomer(req: Request): Promise<ApiCustomerCtx> {
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) throw new ApiTokenError("Missing bearer token");
  const claims = await verifyAccessToken(token);

  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: { id: true, organizationId: true, email: true, status: true, sessionVersion: true },
  });
  if (
    !user ||
    user.status === "DISABLED" ||
    user.organizationId !== claims.orgId ||
    user.sessionVersion !== claims.sessionVersion
  )
    throw new ApiTokenError();

  const customer = await customerForCtx({
    orgId: user.organizationId,
    userId: user.id,
    email: user.email,
    roles: [],
    regionIds: [],
    isSuperAdmin: false,
  });
  return {
    customerId: customer.id,
    userId: user.id,
    organizationId: user.organizationId,
    customer,
  };
}
