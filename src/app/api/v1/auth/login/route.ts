import { z } from "zod";
import { signAccessToken, signRefreshToken } from "@/modules/auth/api-tokens";
import { verifyPassword } from "@/modules/auth/password";
import { customerForCtx } from "@/modules/customer/queries";
import { prisma } from "@/modules/db/client";
import { withOrg } from "@/modules/shared/api/handlers";
import { fail, ok } from "@/modules/shared/api/response";
import { clientIp, rateLimit, recordFailure } from "@/modules/shared/rate-limit";

const schema = z.object({ email: z.string().trim().email(), password: z.string().min(1) });

export function POST(req: Request) {
  return withOrg(req, async ({ organizationId }) => {
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("INVALID", 400, parsed.error.issues);
    const email = parsed.data.email.toLowerCase();

    const subject = `${organizationId}:${email}`;
    const [byAccount, byIp] = await Promise.all([
      rateLimit("api-login", subject, 10, 300, undefined, { consume: false }),
      rateLimit("api-login-ip", await clientIp(), 30, 300, undefined, { consume: false }),
    ]);
    if (!byAccount.allowed || !byIp.allowed) return fail("RATE_LIMITED", 429);

    const user = await prisma.user.findUnique({
      where: { organizationId_email: { organizationId, email } },
      select: { id: true, status: true, passwordHash: true, sessionVersion: true },
    });
    if (
      !user?.passwordHash ||
      user.status !== "ACTIVE" ||
      !(await verifyPassword(user.passwordHash, parsed.data.password))
    ) {
      await Promise.all([
        recordFailure("api-login", subject, 300),
        recordFailure("api-login-ip", await clientIp(), 300),
      ]);
      return fail("INVALID_CREDENTIALS", 401);
    }

    const customer = await customerForCtx({
      orgId: organizationId,
      userId: user.id,
      email,
      roles: [],
      regionIds: [],
      isSuperAdmin: false,
    });
    const claims = { sub: user.id, orgId: organizationId, sessionVersion: user.sessionVersion };
    const [accessToken, refreshToken] = await Promise.all([
      signAccessToken(claims),
      signRefreshToken(claims),
    ]);
    return ok({ accessToken, refreshToken, customerId: customer.id });
  });
}
