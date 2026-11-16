import { otpRequestBody } from "@msb/shared/mobile-api";
import { requestOtp } from "@/modules/auth/otp";
import { apiError, apiOk, parseJson, publicRoute } from "@/modules/mobile-api/http";

export const runtime = "nodejs";

/** Sends a sign-in code to the cleaner's mobile (email in dev). Never reveals unknown numbers. */
export const POST = publicRoute(async (req) => {
  const body = await parseJson(req, otpRequestBody);
  if ("response" in body) return body.response;
  const r = await requestOtp(body.data.phone);
  if (!r.ok) return apiError(/too many/i.test(r.message) ? "RATE_LIMITED" : "INVALID", r.message);
  return apiOk({ channel: r.channel, maskedTo: r.maskedTo });
});
