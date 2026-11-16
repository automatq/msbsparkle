import { otpVerifyBody } from "@msb/shared/mobile-api";
import { createMobileSession } from "@/modules/auth/mobile";
import { verifyOtp } from "@/modules/auth/otp";
import { resolveCleanerActor } from "@/modules/cleaner/service";
import { apiError, apiOk, parseJson, publicRoute } from "@/modules/mobile-api/http";

export const runtime = "nodejs";

/** Exchanges a valid code for a token pair. Guess limits live in verifyOtp. */
export const POST = publicRoute(async (req) => {
  const body = await parseJson(req, otpVerifyBody);
  if ("response" in body) return body.response;
  const userId = await verifyOtp(body.data.phone, body.data.code);
  if (!userId) return apiError("INVALID", "That code didn't work. Check it or request a new one.");
  if (!(await resolveCleanerActor(userId)))
    return apiError("INACTIVE", "Your cleaner account isn't active. Contact your dispatcher.");
  return apiOk(await createMobileSession(userId, body.data.device));
});
