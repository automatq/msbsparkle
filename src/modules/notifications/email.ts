import nodemailer from "nodemailer";
import { Resend } from "resend";
import { prisma } from "@/modules/db/client";
import type { ActorType } from "@/generated/prisma/enums";

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  templateKey: string;
  organizationId: string;
  recipientType: ActorType;
  recipientId?: string | null;
  jobId?: string | null;
  bookingId?: string | null;
  dedupeKey?: string | null;
  payload?: Record<string, unknown>;
};

async function deliver(msg: EmailMessage): Promise<string | null> {
  const from = process.env.EMAIL_FROM ?? "MSB Sparkle <hello@localhost>";
  if (process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const res = await resend.emails.send({
      from,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
    });
    if (res.error) throw new Error(res.error.message);
    return res.data?.id ?? null;
  }
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "localhost",
    port: Number(process.env.SMTP_PORT ?? 1025),
    secure: false,
  });
  const info = await transport.sendMail({
    from,
    to: msg.to,
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
  });
  return info.messageId ?? null;
}

/** Sends an email and records a Notification row. Dedupe key prevents double sends. */
export async function sendEmail(msg: EmailMessage): Promise<void> {
  if (msg.dedupeKey) {
    const dup = await prisma.notification.findUnique({ where: { dedupeKey: msg.dedupeKey } });
    if (dup) return;
  }
  let row;
  try {
    row = await prisma.notification.create({
      data: {
        organizationId: msg.organizationId,
        channel: "EMAIL",
        templateKey: msg.templateKey,
        recipientType: msg.recipientType,
        recipientId: msg.recipientId ?? null,
        to: msg.to,
        jobId: msg.jobId ?? null,
        bookingId: msg.bookingId ?? null,
        dedupeKey: msg.dedupeKey ?? null,
        payload: (msg.payload ?? {}) as object,
      },
    });
  } catch (e) {
    // A concurrent run already recorded this dedupe key: nothing to send.
    if (isDuplicate(e)) return;
    throw e;
  }
  try {
    const providerMessageId = await deliver(msg);
    await prisma.notification.update({
      where: { id: row.id },
      data: { status: "SENT", sentAt: new Date(), providerMessageId },
    });
  } catch (e) {
    await prisma.notification.update({
      where: { id: row.id },
      data: { status: "FAILED", error: e instanceof Error ? e.message : String(e) },
    });
    throw e;
  }
}

function isDuplicate(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}
