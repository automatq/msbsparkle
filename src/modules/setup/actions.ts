"use server";

import { RegionInputError } from "@/modules/regions/manage";
import { allowIp } from "@/modules/shared/rate-limit";
import {
  SetupError,
  completeSetup,
  isSetupPending,
  setupSchema,
  verifySetupKey,
  type SetupInput,
} from "./setup";

export type SetupResult = { ok: true } | { ok: false; message: string };

export async function completeSetupAction(key: string, raw: SetupInput): Promise<SetupResult> {
  if (!(await allowIp("setup:ip", 10, 60 * 60)))
    return { ok: false, message: "Too many attempts. Try again in an hour." };
  if (!(await isSetupPending()))
    return { ok: false, message: "Setup has already been completed. Sign in at /admin/login." };
  if (!verifySetupKey(key))
    return {
      ok: false,
      message: "That setup key isn't right. It's the AUTH_SECRET value set for this deployment.",
    };
  const parsed = setupSchema.safeParse(raw);
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Please check the form." };
  try {
    await completeSetup(parsed.data);
    return { ok: true };
  } catch (e) {
    if (e instanceof SetupError || e instanceof RegionInputError)
      return { ok: false, message: e.message };
    console.error("[setup] failed", e);
    return { ok: false, message: "Setup failed. Check the server logs and try again." };
  }
}
