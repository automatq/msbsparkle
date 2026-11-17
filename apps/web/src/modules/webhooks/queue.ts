import { randomUUID } from "node:crypto";
import { after } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { emit } from "@/modules/jobs/client";
import type { WebhookEventType } from "./events";
import type { Db } from "./payloads";

/**
 * Records an event for every enabled endpoint subscribed to it. Pass the transaction that makes
 * the change, so the event exists if and only if the change commits (a transactional outbox).
 * Delivery starts after the current request finishes; a scheduled sweep retries anything left.
 *
 * `key` identifies the event so recording it twice (e.g. from our code and from Stripe's
 * webhook) sends it once. Costs one indexed query when the company has no endpoints.
 */
export async function recordWebhookEvent(
  db: Db,
  event: {
    organizationId: string;
    type: WebhookEventType;
    key: string;
    data: (db: Db) => Promise<unknown>;
  },
): Promise<void> {
  const endpoints = await db.webhookEndpoint.findMany({
    where: { organizationId: event.organizationId, enabled: true },
    select: { id: true, events: true },
  });
  const targets = endpoints.filter((e) => !e.events.length || e.events.includes(event.type));
  if (!targets.length) return;
  const messageId = `msg_${randomUUID().replace(/-/g, "")}`;
  const payload = {
    id: messageId,
    type: event.type,
    createdAt: new Date().toISOString(),
    data: await event.data(db),
  } as Prisma.InputJsonValue;
  await db.webhookDelivery.createMany({
    data: targets.map((t) => ({
      endpointId: t.id,
      messageId,
      eventKey: event.key,
      eventType: event.type,
      payload,
    })),
    skipDuplicates: true,
  });
  deliverAfterResponse();
}

/** Same as recordWebhookEvent, but never throws: for code paths that must not fail on it. */
export async function recordWebhookEventSafe(
  db: Db,
  event: Parameters<typeof recordWebhookEvent>[1],
): Promise<void> {
  try {
    await recordWebhookEvent(db, event);
  } catch (e) {
    console.error(`[webhooks] could not record ${event.type}:`, e);
  }
}

function deliverAfterResponse() {
  try {
    // Runs once the response is sent, by which time the caller's transaction has committed.
    after(async () => {
      if (await emit("webhooks/flush", {})) return;
      // No Inngest: deliver here instead (retries then happen on the next request's flush).
      const { deliverDue } = await import("./deliver");
      await deliverDue({ limit: 10 });
    });
  } catch {
    // Outside a request (scripts, tests, Inngest steps without request scope): the sweep sends it.
  }
}

/**
 * Payment events. Keys make repeats harmless: one success per charge, one failure per attempt,
 * one refund per refunded total (our refund and Stripe's charge.refunded report the same one).
 */
export async function recordPaymentEvent(
  db: Db,
  chargeId: string,
  type: "payment.succeeded" | "payment.failed" | "payment.refunded",
  opts: { refundedCents?: number } = {},
): Promise<void> {
  try {
    const c = await db.charge.findUnique({
      where: { id: chargeId },
      select: { organizationId: true, attemptCount: true },
    });
    if (!c) return;
    const key =
      type === "payment.succeeded"
        ? `${type}:${chargeId}`
        : type === "payment.failed"
          ? `${type}:${chargeId}:${c.attemptCount}`
          : `${type}:${chargeId}:${opts.refundedCents ?? "?"}`;
    const { chargePayload } = await import("./payloads");
    await recordWebhookEvent(db, {
      organizationId: c.organizationId,
      type,
      key,
      data: (d) => chargePayload(d, chargeId),
    });
  } catch (e) {
    console.error(`[webhooks] could not record ${type} for ${chargeId}:`, e);
  }
}
