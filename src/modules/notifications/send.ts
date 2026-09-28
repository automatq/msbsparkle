import type { ActorType } from "@/generated/prisma/enums";
import { prisma } from "@/modules/db/client";
import { sendEmail } from "./email";
import { normalizePhone, sendSms } from "./sms";
import type { Msg } from "./templates";

export const brand = () => process.env.NEXT_PUBLIC_BRAND_NAME ?? "MSB Sparkle";
export const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

type Target = {
  organizationId: string;
  recipientType: ActorType;
  recipientId: string;
  email: string;
  phone: string | null;
  smsOptOut?: boolean;
  jobId?: string | null;
  bookingId?: string | null;
};

/**
 * Sends a message by email and, when the recipient has a mobile and hasn't opted out, by SMS.
 * dedupeKey guards each channel independently so a retry never double-sends.
 */
export async function notify(
  target: Target,
  templateKey: string,
  msg: Msg,
  dedupeKey: string,
  channels: ("email" | "sms")[] = ["email", "sms"],
): Promise<void> {
  const base = {
    organizationId: target.organizationId,
    recipientType: target.recipientType,
    recipientId: target.recipientId,
    jobId: target.jobId ?? null,
    bookingId: target.bookingId ?? null,
    templateKey,
  };
  if (channels.includes("email")) {
    await sendEmail({
      ...base,
      to: target.email,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      dedupeKey: `${dedupeKey}:email`,
    }).catch((e) => console.error("email failed", templateKey, e));
  }
  const phone = target.phone ? normalizePhone(target.phone) : null;
  if (channels.includes("sms") && msg.sms && phone && !target.smsOptOut) {
    await sendSms({ ...base, to: phone, body: msg.sms, dedupeKey: `${dedupeKey}:sms` }).catch((e) =>
      console.error("sms failed", templateKey, e),
    );
  }
}

export async function customerTarget(
  customerId: string,
  extra: { jobId?: string | null; bookingId?: string | null } = {},
): Promise<Target> {
  const c = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
  return {
    organizationId: c.organizationId,
    recipientType: "CUSTOMER",
    recipientId: c.id,
    email: c.email,
    phone: c.phone,
    smsOptOut: c.smsOptOut,
    ...extra,
  };
}

export async function cleanerTarget(
  cleanerId: string,
  extra: { jobId?: string | null } = {},
): Promise<Target> {
  const c = await prisma.cleaner.findUniqueOrThrow({ where: { id: cleanerId } });
  return {
    organizationId: c.organizationId,
    recipientType: "CLEANER",
    recipientId: c.id,
    email: c.email,
    phone: c.phone,
    ...extra,
  };
}
