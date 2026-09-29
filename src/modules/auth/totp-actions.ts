"use server";

import { revalidatePath } from "next/cache";
import QRCode from "qrcode";
import { prisma } from "@/modules/db/client";
import { getCtx } from "./session";
import { decryptSecret, encryptSecret, generateTotpSecret, totpUri, verifyTotp } from "./totp";

export type TotpResult = { ok: true; message?: string } | { ok: false; message: string };

/** Starts enrolment: stores an encrypted pending secret and returns a QR data URL + manual key. */
export async function startTotpEnrolmentAction(): Promise<
  { ok: true; qrDataUrl: string; secret: string } | { ok: false; message: string }
> {
  try {
    const ctx = await getCtx("SUPER_ADMIN", "REGION_ADMIN");
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });
    if (user.totpEnabled)
      return { ok: false, message: "Two-factor authentication is already enabled." };
    const secret = generateTotpSecret();
    await prisma.user.update({
      where: { id: user.id },
      data: { totpSecret: encryptSecret(secret), totpEnabled: false },
    });
    const uri = totpUri(secret, user.email, process.env.NEXT_PUBLIC_BRAND_NAME ?? "MSB Sparkle");
    return { ok: true, qrDataUrl: await QRCode.toDataURL(uri, { margin: 1, width: 200 }), secret };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not start enrolment" };
  }
}

/** Confirms the authenticator works before enforcing it at login. */
export async function confirmTotpEnrolmentAction(code: string): Promise<TotpResult> {
  try {
    const ctx = await getCtx("SUPER_ADMIN", "REGION_ADMIN");
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });
    if (!user.totpSecret) return { ok: false, message: "Start enrolment first." };
    if (!verifyTotp(decryptSecret(user.totpSecret), code))
      return {
        ok: false,
        message: "That code didn't match. Check your authenticator's time and try again.",
      };
    await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: true } });
    await prisma.auditLog.create({
      data: {
        organizationId: ctx.orgId,
        actorType: "ADMIN",
        actorId: ctx.userId,
        entityType: "User",
        entityId: user.id,
        action: "user.totp_enabled",
      },
    });
    revalidatePath("/admin/settings/security");
    return {
      ok: true,
      message: "Two-factor authentication is on. You'll need a code at every sign-in.",
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not confirm" };
  }
}

export async function disableTotpAction(code: string): Promise<TotpResult> {
  try {
    const ctx = await getCtx("SUPER_ADMIN", "REGION_ADMIN");
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });
    if (!user.totpEnabled || !user.totpSecret)
      return { ok: false, message: "Two-factor authentication is not enabled." };
    if (!verifyTotp(decryptSecret(user.totpSecret), code))
      return { ok: false, message: "Enter a current code to turn it off." };
    await prisma.user.update({
      where: { id: user.id },
      data: { totpEnabled: false, totpSecret: null },
    });
    await prisma.auditLog.create({
      data: {
        organizationId: ctx.orgId,
        actorType: "ADMIN",
        actorId: ctx.userId,
        entityType: "User",
        entityId: user.id,
        action: "user.totp_disabled",
      },
    });
    revalidatePath("/admin/settings/security");
    return { ok: true, message: "Two-factor authentication is off." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not disable" };
  }
}
