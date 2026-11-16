import { getMobileAuth, revokeSessionById } from "@/modules/auth/mobile";
import { apiOk, publicRoute } from "@/modules/mobile-api/http";

export const runtime = "nodejs";

/** Ends this device's session. Always succeeds, so the app can clear its tokens regardless. */
export const POST = publicRoute(async (req) => {
  const auth = await getMobileAuth(req);
  if (auth) await revokeSessionById(auth.sessionId, "signed out");
  return apiOk(null);
});
