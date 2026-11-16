import { refreshBody } from "@msb/shared/mobile-api";
import { refreshMobileSession } from "@/modules/auth/mobile";
import { apiError, apiOk, parseJson, publicRoute } from "@/modules/mobile-api/http";
import { clientIp, rateLimit } from "@/modules/shared/rate-limit";

export const runtime = "nodejs";

/** Rotates the token pair. On SESSION_ENDED the app must sign in again. */
export const POST = publicRoute(async (req) => {
  const rl = await rateLimit("mobile:refresh", await clientIp(), 60, 60);
  if (!rl.allowed)
    return apiError("RATE_LIMITED", "Too many requests.", {
      retryAfterSeconds: rl.retryAfterSeconds,
    });
  const body = await parseJson(req, refreshBody);
  if ("response" in body) return body.response;
  const r = await refreshMobileSession(body.data.refreshToken);
  if (!r.ok) return apiError("SESSION_ENDED", "Your session ended. Sign in again.");
  return apiOk(r.tokens);
});
