/**
 * Push notifications to the cleaner mobile app through Expo's push service.
 *
 * Delivery mode (PUSH_DELIVERY): "expo" sends for real (default in production); "log" only
 * prints, like SMS without Twilio (default elsewhere, so tests and local dev never hit Expo).
 * EXPO_ACCESS_TOKEN is optional; set it if "enhanced push security" is on for the Expo project.
 *
 * Each device gets its own Notification row (channel PUSH) holding Expo's ticket id. The
 * push-receipts task later turns tickets into DELIVERED / FAILED and disables dead tokens.
 */
import type { ActorType } from "@/generated/prisma/enums";
import { prisma } from "@/modules/db/client";

const SEND_URL = "https://exp.host/--/api/v2/push/send";
const RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const SEND_BATCH = 100; // Expo's limit per request
const RECEIPT_BATCH = 1000;

export const EXPO_TOKEN_RE = /^Expo(nent)?PushToken\[[^\]]+\]$/;

export type PushPayload = {
  title: string;
  body: string;
  /** Delivered to the app with the notification; `jobId` makes a tap open that job. */
  data?: Record<string, string>;
};

type ExpoTicket =
  { status: "ok"; id: string } | { status: "error"; message: string; details?: { error?: string } };
type ExpoReceipt =
  { status: "ok" } | { status: "error"; message: string; details?: { error?: string } };

function deliveryMode(): "expo" | "log" {
  const v = process.env.PUSH_DELIVERY;
  if (v === "expo" || v === "log") return v;
  return process.env.NODE_ENV === "production" ? "expo" : "log";
}

function expoHeaders(): Record<string, string> {
  return {
    accept: "application/json",
    "accept-encoding": "gzip, deflate",
    "content-type": "application/json",
    ...(process.env.EXPO_ACCESS_TOKEN
      ? { authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` }
      : {}),
  };
}

/** Active devices: not disabled, and still attached to a live session. */
export async function activePushDevices(userId: string) {
  return prisma.pushDevice.findMany({
    where: {
      userId,
      disabledAt: null,
      mobileSession: { revokedAt: null, refreshExpiresAt: { gt: new Date() } },
    },
    select: { id: true, expoPushToken: true },
  });
}

export async function disablePushToken(token: string, reason: string) {
  await prisma.pushDevice.updateMany({
    where: { expoPushToken: token, disabledAt: null },
    data: { disabledAt: new Date(), disabledReason: reason },
  });
}

/**
 * Sends one push to every active device of a user. Returns how many devices it reached (or had
 * already reached for this dedupeKey), so callers can fall back to SMS when it is 0.
 */
export async function sendPush(msg: {
  userId: string;
  payload: PushPayload;
  templateKey: string;
  organizationId: string;
  recipientType: ActorType;
  recipientId?: string | null;
  jobId?: string | null;
  dedupeKey?: string | null;
}): Promise<number> {
  const devices = await activePushDevices(msg.userId);
  if (!devices.length) return 0;

  let reached = 0;
  const pending: { rowId: string; token: string }[] = [];
  for (const d of devices) {
    const dedupeKey = msg.dedupeKey ? `${msg.dedupeKey}:${d.id}` : null;
    if (dedupeKey && (await prisma.notification.findUnique({ where: { dedupeKey } }))) {
      reached++;
      continue;
    }
    const row = await prisma.notification.create({
      data: {
        organizationId: msg.organizationId,
        channel: "PUSH",
        templateKey: msg.templateKey,
        recipientType: msg.recipientType,
        recipientId: msg.recipientId ?? null,
        to: d.expoPushToken,
        jobId: msg.jobId ?? null,
        dedupeKey,
        payload: { title: msg.payload.title, body: msg.payload.body },
      },
    });
    pending.push({ rowId: row.id, token: d.expoPushToken });
  }

  for (let i = 0; i < pending.length; i += SEND_BATCH) {
    const batch = pending.slice(i, i + SEND_BATCH);
    let tickets: ExpoTicket[];
    try {
      tickets = await deliver(
        batch.map((b) => b.token),
        msg.payload,
      );
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await prisma.notification.updateMany({
        where: { id: { in: batch.map((b) => b.rowId) } },
        data: { status: "FAILED", error },
      });
      console.error("[push] send failed", msg.templateKey, error);
      continue;
    }
    for (const [j, b] of batch.entries()) {
      const t = tickets[j];
      if (t?.status === "ok") {
        reached++;
        await prisma.notification.update({
          where: { id: b.rowId },
          data: { status: "SENT", sentAt: new Date(), providerMessageId: t.id || null },
        });
      } else {
        const error = t ? `${t.details?.error ?? ""} ${t.message}`.trim() : "no ticket";
        await prisma.notification.update({
          where: { id: b.rowId },
          data: { status: "FAILED", error },
        });
        if (t?.details?.error === "DeviceNotRegistered")
          await disablePushToken(b.token, "DeviceNotRegistered");
      }
    }
  }
  return reached;
}

async function deliver(tokens: string[], payload: PushPayload): Promise<ExpoTicket[]> {
  if (deliveryMode() === "log") {
    console.log(`[push:dev] to ${tokens.length} device(s): ${payload.title} | ${payload.body}`);
    return tokens.map(() => ({ status: "ok", id: "" }));
  }
  const res = await fetch(SEND_URL, {
    method: "POST",
    headers: expoHeaders(),
    body: JSON.stringify(
      tokens.map((to) => ({
        to,
        title: payload.title,
        body: payload.body,
        data: payload.data ?? {},
        sound: "default",
        priority: "high",
        channelId: "jobs", // Android channel the app creates
      })),
    ),
  });
  const json = (await res.json().catch(() => null)) as {
    data?: ExpoTicket[];
    errors?: { message: string }[];
  } | null;
  if (!res.ok || !json?.data)
    throw new Error(json?.errors?.[0]?.message ?? `Expo push ${res.status}`);
  return json.data;
}

/**
 * Checks Expo receipts for pushes sent between 15 minutes and 24 hours ago (Expo keeps them for
 * a day). Marks each DELIVERED or FAILED and disables tokens Expo reports as unregistered.
 */
export async function runPushReceipts(
  now = new Date(),
): Promise<{ checked: number; failed: number }> {
  if (deliveryMode() === "log") return { checked: 0, failed: 0 };
  const rows = await prisma.notification.findMany({
    where: {
      channel: "PUSH",
      status: "SENT",
      providerMessageId: { not: null },
      sentAt: {
        gte: new Date(now.getTime() - 24 * 3600_000),
        lte: new Date(now.getTime() - 15 * 60_000),
      },
    },
    select: { id: true, to: true, providerMessageId: true },
    take: 5000,
  });
  let checked = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i += RECEIPT_BATCH) {
    const batch = rows.slice(i, i + RECEIPT_BATCH);
    const res = await fetch(RECEIPTS_URL, {
      method: "POST",
      headers: expoHeaders(),
      body: JSON.stringify({ ids: batch.map((r) => r.providerMessageId) }),
    });
    const json = (await res.json().catch(() => null)) as {
      data?: Record<string, ExpoReceipt>;
    } | null;
    if (!res.ok || !json?.data) {
      console.error("[push] receipts failed", res.status);
      continue;
    }
    for (const r of batch) {
      const receipt = json.data[r.providerMessageId!];
      if (!receipt) continue; // not ready yet
      checked++;
      if (receipt.status === "ok") {
        await prisma.notification.update({ where: { id: r.id }, data: { status: "DELIVERED" } });
      } else {
        failed++;
        await prisma.notification.update({
          where: { id: r.id },
          data: {
            status: "FAILED",
            error: `${receipt.details?.error ?? ""} ${receipt.message}`.trim(),
          },
        });
        if (receipt.details?.error === "DeviceNotRegistered")
          await disablePushToken(r.to, "DeviceNotRegistered");
      }
    }
  }
  return { checked, failed };
}
