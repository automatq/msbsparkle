import { z } from "zod";
import {
  ApiTokenError,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "@/modules/auth/api-tokens";
import { prisma } from "@/modules/db/client";
import { fail, ok } from "@/modules/shared/api/response";

const schema = z.object({ refreshToken: z.string().min(1) });

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("INVALID", 400, parsed.error.issues);

  try {
    const claims = await verifyRefreshToken(parsed.data.refreshToken);
    const user = await prisma.user.findUnique({
      where: { id: claims.sub },
      select: { id: true, organizationId: true, status: true, sessionVersion: true },
    });
    if (
      !user ||
      user.status !== "ACTIVE" ||
      user.organizationId !== claims.orgId ||
      user.sessionVersion !== claims.sessionVersion
    )
      return fail("UNAUTHORIZED", 401);

    const next = { sub: user.id, orgId: user.organizationId, sessionVersion: user.sessionVersion };
    const [accessToken, refreshToken] = await Promise.all([
      signAccessToken(next),
      signRefreshToken(next),
    ]);
    return ok({ accessToken, refreshToken });
  } catch (e) {
    if (e instanceof ApiTokenError) return fail("UNAUTHORIZED", 401);
    throw e;
  }
}
