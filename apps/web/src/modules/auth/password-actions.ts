"use server";

import { z } from "zod";
import { clientIp, rateLimit } from "@/modules/shared/rate-limit";
import {
  MIN_PASSWORD_LENGTH,
  TeamError,
  requestPasswordReset,
  setPasswordWithLink,
} from "./admin-users";

/**
 * Signed-out admin password actions: the emailed set-password link and "forgot password".
 * Both are public, so both are rate-limited here. They take FormData and return state for
 * `useActionState`, so the forms also work when submitted before the page has hydrated.
 */

export type PasswordFormState =
  { ok: true; email?: string } | { ok: false; message: string } | null;

/** A text field's value. Anything else (missing, or an uploaded file) reads as empty. */
function field(form: FormData, name: string): string {
  const v = form.get(name);
  return typeof v === "string" ? v : "";
}

const TOO_MANY = { ok: false as const, message: "Too many attempts. Try again in a few minutes." };

export async function setPasswordAction(
  token: string,
  _prev: PasswordFormState,
  form: FormData,
): Promise<PasswordFormState> {
  // Tokens are 256-bit, so this only stops someone hammering the endpoint.
  if (!(await rateLimit("admin-set-password:ip", await clientIp(), 20, 15 * 60)).allowed)
    return TOO_MANY;
  const password = field(form, "password");
  if (password.length < MIN_PASSWORD_LENGTH)
    return {
      ok: false,
      message: `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  if (password !== field(form, "again"))
    return { ok: false, message: "The two passwords don't match." };
  try {
    const { email } = await setPasswordWithLink(String(token), password);
    return { ok: true, email };
  } catch (e) {
    if (e instanceof TeamError) return { ok: false, message: e.message };
    console.error("[auth] set password failed", e);
    return { ok: false, message: "Something went wrong. Try again." };
  }
}

/** Always answers the same way, whether or not the address belongs to an admin. */
export async function forgotPasswordAction(
  _prev: PasswordFormState,
  form: FormData,
): Promise<PasswordFormState> {
  const parsed = z.string().trim().toLowerCase().email().safeParse(field(form, "email"));
  if (!parsed.success) return { ok: false, message: "Enter a valid email address." };
  const [byEmail, byIp] = await Promise.all([
    rateLimit("admin-forgot:email", parsed.data, 3, 60 * 60),
    rateLimit("admin-forgot:ip", await clientIp(), 10, 60 * 60),
  ]);
  if (!byIp.allowed) return TOO_MANY;
  // Over the per-address limit: stay silent rather than reveal that the address is being used.
  if (byEmail.allowed) await requestPasswordReset(parsed.data);
  return { ok: true, email: parsed.data };
}
