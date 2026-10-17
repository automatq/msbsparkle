import { z } from "zod";
import { signAccessToken, signRefreshToken } from "@/modules/auth/api-tokens";
import { hashPassword } from "@/modules/auth/password";
import { customerForCtx } from "@/modules/customer/queries";
import { prisma } from "@/modules/db/client";
import { withOrg } from "@/modules/shared/api/handlers";
import { fail, ok } from "@/modules/shared/api/response";
import { clientIp, rateLimit } from "@/modules/shared/rate-limit";

const schema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(200),
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(7).max(20).optional(),
});

export function POST(req: Request) {
  return withOrg(req, async ({ organizationId }) => {
    const rl = await rateLimit("api-signup", await clientIp(), 20, 3600);
    if (!rl.allowed) return fail("RATE_LIMITED", 429);

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("INVALID", 400, parsed.error.issues);
    const { email, password, name, phone } = parsed.data;

    const existing = await prisma.user.findUnique({
      where: { organizationId_email: { organizationId, email: email.toLowerCase() } },
      select: { id: true },
    });
    if (existing) return fail("EMAIL_TAKEN", 409);

    const user = await prisma.user.create({
      data: {
        organizationId,
        email: email.toLowerCase(),
        name,
        phone,
        passwordHash: await hashPassword(password),
        status: "ACTIVE",
        roles: { create: { role: "CUSTOMER" } },
      },
    });
    const customer = await customerForCtx({
      orgId: organizationId,
      userId: user.id,
      email: user.email,
      roles: [],
      regionIds: [],
      isSuperAdmin: false,
    });

    const claims = { sub: user.id, orgId: organizationId, sessionVersion: user.sessionVersion };
    const [accessToken, refreshToken] = await Promise.all([
      signAccessToken(claims),
      signRefreshToken(claims),
    ]);
    return ok({ accessToken, refreshToken, customerId: customer.id }, 201);
  });
}
