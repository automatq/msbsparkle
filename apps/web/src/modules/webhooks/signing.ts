import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Signatures follow the Standard Webhooks spec (https://www.standardwebhooks.com), so receivers
 * can verify with any of its libraries: HMAC-SHA256 over "{webhook-id}.{webhook-timestamp}.{body}"
 * keyed with the base64-decoded part of the "whsec_" secret, sent as "v1,{base64 signature}".
 */
export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString("base64")}`;
}

function secretKey(secret: string): Buffer {
  return Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
}

export function signWebhook(secret: string, id: string, timestamp: number, body: string): string {
  const mac = createHmac("sha256", secretKey(secret))
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  return `v1,${mac}`;
}

/** Receiver-side check (used by tests and as a reference for integrators). */
export function verifyWebhook(
  secret: string,
  headers: { id: string; timestamp: string; signature: string },
  body: string,
  { toleranceSeconds = 300, now = Date.now() } = {},
): boolean {
  const ts = Number(headers.timestamp);
  if (!Number.isInteger(ts) || Math.abs(now / 1000 - ts) > toleranceSeconds) return false;
  const expected = Buffer.from(signWebhook(secret, headers.id, ts, body));
  return headers.signature.split(" ").some((sig) => {
    const got = Buffer.from(sig);
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}
