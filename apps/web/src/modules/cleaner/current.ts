import { cache } from "react";
import { requireRole } from "@/modules/auth/session";
import { resolveCleanerActor } from "@/modules/cleaner/service";

/**
 * The signed-in cleaner for a portal page (redirects to sign-in without a session). Null when the
 * login has no cleaner profile or the cleaner is suspended/inactive. Cached per request.
 */
export const currentCleaner = cache(async () => {
  const ctx = await requireRole("/login/phone", "CLEANER", "SUPER_ADMIN");
  return resolveCleanerActor(ctx.userId);
});
