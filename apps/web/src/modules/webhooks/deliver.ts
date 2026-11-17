import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { decryptSecret } from "@/modules/auth/totp";
import { prisma } from "@/modules/db/client";
import { allowPrivateTargets, isBlockedAddress, safeLookup } from "./safe-url";
import { signWebhook } from "./signing";

/** Wait after the 1st, 2nd, … failed attempt. About 45 hours in total, then FAILED. */
export const RETRY_DELAYS_MS = [1, 5, 30, 120, 360, 720, 1440].map((m) => m * 60_000);
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
const TIMEOUT_MS = 10_000;
/** A claimed delivery is left alone this long; if the sender crashed, it's retried after. */
const LEASE_MS = 2 * 60_000;

export type SendResult = { ok: boolean; status: number | null; error: string | null };

/** POSTs a signed body. Never follows redirects; refuses private addresses (see safe-url). */
export function postWebhook(
  url: string,
  body: string,
  headers: Record<string, string>,
  timeoutMs = TIMEOUT_MS,
): Promise<SendResult> {
  return new Promise((resolve) => {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return resolve({ ok: false, status: null, error: "Invalid URL" });
    }
    const host = u.hostname.replace(/^\[|\]$/g, "");
    const lenient = allowPrivateTargets();
    if (u.protocol !== "https:" && !(lenient && u.protocol === "http:"))
      return resolve({ ok: false, status: null, error: "URL must use https" });
    if (isIP(host) && isBlockedAddress(host) && !lenient)
      return resolve({ ok: false, status: null, error: "Private address refused" });

    const lib = u.protocol === "https:" ? https : http;
    let done = false;
    const finish = (r: SendResult) => {
      if (!done) {
        done = true;
        resolve(r);
      }
    };
    const req = lib.request(
      u,
      {
        method: "POST",
        headers: { ...headers, "content-length": Buffer.byteLength(body).toString() },
        lookup: safeLookup as never,
        timeout: timeoutMs,
        agent: false,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          if (text.length < 500) text += chunk;
        });
        res.on("end", () => {
          const ok = status >= 200 && status < 300;
          finish({
            ok,
            status,
            error: ok
              ? null
              : status >= 300 && status < 400
                ? `Redirect (${status}) not followed; use the final URL`
                : `HTTP ${status}${text ? `: ${text.slice(0, 300)}` : ""}`,
          });
        });
        res.on("error", (e) => finish({ ok: false, status, error: e.message }));
      },
    );
    req.on("timeout", () => req.destroy(new Error(`No response within ${timeoutMs / 1000}s`)));
    req.on("error", (e) => finish({ ok: false, status: null, error: e.message }));
    req.end(body);
  });
}

/**
 * Makes one attempt at a delivery if it is due (or `force`d), claiming it first so concurrent
 * sweeps never send it twice at once. Receivers should still dedupe on `webhook-id`.
 */
export async function attemptDelivery(
  id: string,
  { force = false, now = new Date() }: { force?: boolean; now?: Date } = {},
): Promise<SendResult | null> {
  const claimed = await prisma.webhookDelivery.updateMany({
    where: { id, status: "PENDING", ...(force ? {} : { nextAttemptAt: { lte: now } }) },
    data: { nextAttemptAt: new Date(now.getTime() + LEASE_MS), attempts: { increment: 1 } },
  });
  if (!claimed.count) return null;
  const d = await prisma.webhookDelivery.findUniqueOrThrow({
    where: { id },
    include: { endpoint: true },
  });

  let result: SendResult;
  if (!d.endpoint.enabled) {
    result = { ok: false, status: null, error: "Endpoint is disabled" };
  } else {
    const body = JSON.stringify(d.payload);
    const timestamp = Math.floor(Date.now() / 1000);
    result = await postWebhook(d.endpoint.url, body, {
      "content-type": "application/json",
      "user-agent": "BookingWebhooks/1.0",
      "webhook-id": d.messageId,
      "webhook-timestamp": String(timestamp),
      "webhook-signature": signWebhook(
        decryptSecret(d.endpoint.secretEncrypted),
        d.messageId,
        timestamp,
        body,
      ),
    });
  }

  const giveUp = !d.endpoint.enabled || d.attempts >= MAX_ATTEMPTS;
  await prisma.webhookDelivery.update({
    where: { id },
    data: result.ok
      ? {
          status: "SUCCEEDED",
          deliveredAt: new Date(),
          nextAttemptAt: null,
          lastStatusCode: result.status,
          lastError: null,
        }
      : {
          status: giveUp ? "FAILED" : "PENDING",
          nextAttemptAt: giveUp
            ? null
            : new Date(Date.now() + RETRY_DELAYS_MS[Math.min(d.attempts, MAX_ATTEMPTS - 1) - 1]),
          lastStatusCode: result.status,
          lastError: result.error?.slice(0, 500) ?? null,
        },
  });
  return result;
}

/** Sends every due delivery (a few at a time). Run by the flush event and the sweep. */
export async function deliverDue({ limit = 100, now = new Date() } = {}) {
  const due = await prisma.webhookDelivery.findMany({
    where: { status: "PENDING", nextAttemptAt: { lte: now } },
    orderBy: { nextAttemptAt: "asc" },
    take: limit,
    select: { id: true },
  });
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < due.length; i += 5) {
    const results = await Promise.all(
      due.slice(i, i + 5).map((d) => attemptDelivery(d.id, { now })),
    );
    for (const r of results) {
      if (r?.ok) sent++;
      else if (r) failed++;
    }
  }
  return { due: due.length, sent, failed };
}
