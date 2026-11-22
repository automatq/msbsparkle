"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  TeamError,
  inviteAdmin,
  removeAdmin,
  resetTwoFactor,
  sendPasswordLink,
  setAdminAccess,
} from "@/modules/auth/admin-users";
import { ForbiddenError, getCtx } from "@/modules/auth/session";

/** Team management for super admins. The rules live in auth/admin-users. */

export type TeamActionResult =
  | { ok: true; message: string; link?: string; warnings?: string[] }
  | { ok: false; message: string };

const accessSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("SUPER_ADMIN") }),
  z.object({ role: z.literal("REGION_ADMIN"), regionIds: z.array(z.string().min(1)).max(200) }),
]);
const inviteSchema = z.object({
  name: z.string().trim().min(1, "Enter their name.").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  access: accessSchema,
});

function fail(e: unknown): TeamActionResult {
  if (e instanceof z.ZodError)
    return { ok: false, message: e.issues[0]?.message ?? "Check the form." };
  if (e instanceof TeamError || e instanceof ForbiddenError)
    return { ok: false, message: e.message };
  console.error("[team]", e);
  return { ok: false, message: "Something went wrong. Try again." };
}

const done = () => revalidatePath("/admin/settings/team");

/** When the email couldn't be sent, the link is still returned so it can be passed on by hand. */
const linkWarnings = (emailed: boolean) =>
  emailed ? [] : ["The email could not be sent. Copy the link and send it to them yourself."];

export async function inviteAdminAction(raw: unknown): Promise<TeamActionResult> {
  try {
    const ctx = await getCtx("SUPER_ADMIN");
    const input = inviteSchema.parse(raw);
    const res = await inviteAdmin(ctx, input);
    done();
    return {
      ok: true,
      message: res.emailed ? `Invitation sent to ${input.email}` : "Invitation created",
      link: res.link,
      warnings: linkWarnings(res.emailed),
    };
  } catch (e) {
    return fail(e);
  }
}

export async function setAdminAccessAction(
  userId: string,
  raw: unknown,
): Promise<TeamActionResult> {
  try {
    const ctx = await getCtx("SUPER_ADMIN");
    await setAdminAccess(ctx, userId, accessSchema.parse(raw));
    done();
    return { ok: true, message: "Access updated" };
  } catch (e) {
    return fail(e);
  }
}

export async function removeAdminAction(userId: string): Promise<TeamActionResult> {
  try {
    const ctx = await getCtx("SUPER_ADMIN");
    await removeAdmin(ctx, userId);
    done();
    return { ok: true, message: "Removed from the team" };
  } catch (e) {
    return fail(e);
  }
}

export async function sendPasswordLinkAction(userId: string): Promise<TeamActionResult> {
  try {
    const ctx = await getCtx("SUPER_ADMIN");
    const res = await sendPasswordLink(ctx, userId);
    done();
    return {
      ok: true,
      message: res.emailed ? "Link sent" : "Link created",
      link: res.link,
      warnings: linkWarnings(res.emailed),
    };
  } catch (e) {
    return fail(e);
  }
}

export async function resetTwoFactorAction(userId: string): Promise<TeamActionResult> {
  try {
    const ctx = await getCtx("SUPER_ADMIN");
    await resetTwoFactor(ctx, userId);
    done();
    return { ok: true, message: "Two-factor sign-in was turned off for them" };
  } catch (e) {
    return fail(e);
  }
}
