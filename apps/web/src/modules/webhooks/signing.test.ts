import { Webhook } from "standardwebhooks";
import { describe, expect, it } from "vitest";
import { generateWebhookSecret, signWebhook, verifyWebhook } from "./signing";

describe("webhook signing", () => {
  const secret = generateWebhookSecret();
  const body = JSON.stringify({ id: "msg_1", type: "booking.created", data: { a: 1 } });
  const ts = Math.floor(Date.now() / 1000);
  const headers = {
    id: "msg_1",
    timestamp: String(ts),
    signature: signWebhook(secret, "msg_1", ts, body),
  };

  it("generates distinct whsec_ secrets", () => {
    expect(secret).toMatch(/^whsec_[A-Za-z0-9+/=]{32}$/);
    expect(generateWebhookSecret()).not.toBe(secret);
  });

  it("is accepted by the Standard Webhooks reference library", () => {
    const wh = new Webhook(secret);
    expect(
      wh.verify(body, {
        "webhook-id": headers.id,
        "webhook-timestamp": headers.timestamp,
        "webhook-signature": headers.signature,
      }),
    ).toMatchObject({ type: "booking.created" });
  });

  it("matches the reference library's signature", () => {
    expect(new Webhook(secret).sign("msg_1", new Date(ts * 1000), body)).toBe(headers.signature);
  });

  it("rejects tampering, wrong secrets and stale timestamps", () => {
    expect(verifyWebhook(secret, headers, body)).toBe(true);
    expect(verifyWebhook(secret, headers, body.replace("1}", "2}"))).toBe(false);
    expect(verifyWebhook(generateWebhookSecret(), headers, body)).toBe(false);
    expect(verifyWebhook(secret, { ...headers, id: "msg_2" }, body)).toBe(false);
    expect(verifyWebhook(secret, headers, body, { now: (ts + 600) * 1000 })).toBe(false);
  });
});
