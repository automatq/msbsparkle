import type { ActorType } from "@/generated/prisma/enums";
import { prisma } from "@/modules/db/client";
import { sendEmail } from "./email";
import { sendPush } from "./push";
import { normalizePhone, sendSms } from "./sms";
import type { Msg } from "./templates";
import { brandName, siteUrl } from "@/modules/shared/site";

export const brand = () => brandName;
export const appUrl = () => siteUrl;

type Target = {
  organizationId: string;
  recipientType: ActorType;
  recipientId: string;
  email: string;
  phone: string | null;
  smsOptOut?: boolean;
  /** Login of the recipient; needed for push (the cleaner app). */
  userId?: string | null;
  jobId?: string | null;
  bookingId?: string | null;
};

export type Channel = "email" | "sms" | "push";

/**
 * Sends a message on the given channels: email; SMS when the recipient has a mobile and hasn't
 * opted out; push to the recipient's signed-in app devices. With `smsOnlyWithoutPush`, the SMS is
 * only sent when the push reached no device (cleaners with the app don't get both).
 * dedupeKey guards each channel independently so a retry never double-sends.
 */
export async function notify(
  target: Target,
  templateKey: string,
  msg: Msg,
  dedupeKey: string,
  channels: Channel[] = ["email", "sms"],
  opts: { smsOnlyWithoutPush?: boolean } = {},
): Promise<void> {
  const base = {
    organizationId: target.organizationId,
    recipientType: target.recipientType,
    recipientId: target.recipientId,
    jobId: target.jobId ?? null,
    bookingId: target.bookingId ?? null,
    templateKey,
  };
  let pushed = 0;
  if (channels.includes("push") && msg.push && target.userId) {
    pushed = await sendPush({
      ...base,
      userId: target.userId,
      payload: msg.push,
      dedupeKey: `${dedupeKey}:push`,
    }).catch((e) => {
      console.error("push failed", templateKey, e);
      return 0;
    });
  }
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
  const smsWanted = channels.includes("sms") && !(opts.smsOnlyWithoutPush && pushed > 0);
  if (smsWanted && msg.sms && phone && !target.smsOptOut) {
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
    userId: c.userId,
    ...extra,
  };
}
