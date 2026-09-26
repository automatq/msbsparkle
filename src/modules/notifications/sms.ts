import { prisma } from "@/modules/db/client";
import type { ActorType } from "@/generated/prisma/enums";

export function isTwilioConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER
  );
}

/** E.164-ish normalization for Canadian/US numbers. */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (input.trim().startsWith("+") && digits.length >= 8) return `+${digits}`;
  return null;
}

async function deliver(to: string, body: string): Promise<string | null> {
  if (!isTwilioConfigured()) {
    console.log(`[sms:dev] to ${to}: ${body}`);
    return null;
  }
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM_NUMBER!, Body: body }),
  });
  const json = (await res.json()) as { sid?: string; message?: string };
  if (!res.ok) throw new Error(json.message ?? `Twilio ${res.status}`);
  return json.sid ?? null;
}

export async function sendSms(msg: {
  to: string;
  body: string;
  templateKey: string;
  organizationId: string;
  recipientType: ActorType;
  recipientId?: string | null;
  jobId?: string | null;
  dedupeKey?: string | null;
}): Promise<void> {
  if (
    msg.dedupeKey &&
    (await prisma.notification.findUnique({ where: { dedupeKey: msg.dedupeKey } }))
  )
    return;
  const row = await prisma.notification.create({
    data: {
      organizationId: msg.organizationId,
      channel: "SMS",
      templateKey: msg.templateKey,
      recipientType: msg.recipientType,
      recipientId: msg.recipientId ?? null,
      to: msg.to,
      jobId: msg.jobId ?? null,
      dedupeKey: msg.dedupeKey ?? null,
      payload: {},
    },
  });
  try {
    const id = await deliver(msg.to, msg.body);
    await prisma.notification.update({
      where: { id: row.id },
      data: { status: "SENT", sentAt: new Date(), providerMessageId: id },
    });
  } catch (e) {
    await prisma.notification.update({
      where: { id: row.id },
      data: { status: "FAILED", error: e instanceof Error ? e.message : String(e) },
    });
    throw e;
  }
}
