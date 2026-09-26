import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "@/modules/db/client";
import { sendEmail } from "@/modules/notifications/email";
import { isTwilioConfigured, normalizePhone, sendSms } from "@/modules/notifications/sms";

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ACTIVE_CODES = 3;

function hash(code: string, phone: string): string {
  return createHash("sha256")
    .update(`${phone}:${code}:${process.env.AUTH_SECRET ?? ""}`)
    .digest("hex");
}

export type OtpRequestResult =
  { ok: true; channel: "sms" | "email"; maskedTo: string } | { ok: false; message: string };

/**
 * Sends a 6-digit code to a cleaner's mobile. Without Twilio (local dev), the code goes to the
 * cleaner's email instead so it shows up in Mailpit.
 */
export async function requestOtp(phoneInput: string): Promise<OtpRequestResult> {
  const phone = normalizePhone(phoneInput);
  if (!phone) return { ok: false, message: "Enter a valid mobile number." };
  const cleaner = await prisma.cleaner.findFirst({
    where: {
      phone: { in: [phone, phone.replace("+1", ""), phoneInput.trim()] },
      status: { in: ["ONBOARDING", "ACTIVE"] },
    },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
  // Do not reveal whether the number exists.
  if (!cleaner?.user) return { ok: true, channel: "sms", maskedTo: mask(phone) };

  const active = await prisma.verificationToken.count({
    where: { identifier: `otp:${phone}`, expires: { gt: new Date() } },
  });
  if (active >= MAX_ACTIVE_CODES)
    return { ok: false, message: "Too many codes requested. Try again in a few minutes." };

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await prisma.verificationToken.create({
    data: {
      identifier: `otp:${phone}`,
      token: hash(code, phone),
      expires: new Date(Date.now() + OTP_TTL_MS),
    },
  });
  const brand = process.env.NEXT_PUBLIC_BRAND_NAME ?? "MSB Sparkle";
  const body = `${brand}: your sign-in code is ${code}. It expires in 10 minutes.`;
  if (isTwilioConfigured()) {
    await sendSms({
      to: phone,
      body,
      templateKey: "auth.otp",
      organizationId: cleaner.organizationId,
      recipientType: "CLEANER",
      recipientId: cleaner.id,
    });
    return { ok: true, channel: "sms", maskedTo: mask(phone) };
  }
  await sendEmail({
    to: cleaner.email,
    subject: `${brand} sign-in code: ${code}`,
    text: body,
    html: `<p>${body}</p>`,
    templateKey: "auth.otp",
    organizationId: cleaner.organizationId,
    recipientType: "CLEANER",
    recipientId: cleaner.id,
  });
  return { ok: true, channel: "email", maskedTo: cleaner.email.replace(/^(.).*(@.*)$/, "$1***$2") };
}

/** Returns the user id when the code is valid, consuming it. */
export async function verifyOtp(phoneInput: string, code: string): Promise<string | null> {
  const phone = normalizePhone(phoneInput);
  if (!phone || !/^\d{6}$/.test(code.trim())) return null;
  const tokens = await prisma.verificationToken.findMany({
    where: { identifier: `otp:${phone}`, expires: { gt: new Date() } },
  });
  const expected = Buffer.from(hash(code.trim(), phone));
  const match = tokens.find(
    (t) => t.token.length === expected.length && timingSafeEqual(Buffer.from(t.token), expected),
  );
  if (!match) return null;
  await prisma.verificationToken.deleteMany({ where: { identifier: `otp:${phone}` } });
  const cleaner = await prisma.cleaner.findFirst({
    where: { phone: { in: [phone, phone.replace("+1", "")] } },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
  if (!cleaner?.user || cleaner.user.status === "DISABLED") return null;
  if (cleaner.user.status === "INVITED")
    await prisma.user.update({
      where: { id: cleaner.user.id },
      data: { status: "ACTIVE", phoneVerifiedAt: new Date() },
    });
  return cleaner.user.id;
}

function mask(phone: string): string {
  return phone.replace(/^(\+\d)(\d+)(\d{2})$/, (_, a, b, c) => `${a}${"•".repeat(b.length)}${c}`);
}
