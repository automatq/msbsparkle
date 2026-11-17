import { randomUUID } from "node:crypto";
import { z } from "zod";
import { encryptSecret } from "@/modules/auth/totp";
import { prisma } from "@/modules/db/client";
import { attemptDelivery, type SendResult } from "./deliver";
import { TEST_EVENT, WEBHOOK_EVENT_TYPES, isWebhookEventType } from "./events";
import { WebhookUrlError, validateWebhookUrl } from "./safe-url";
import { generateWebhookSecret } from "./signing";

export const MAX_ENDPOINTS = 10;

export class WebhookInputError extends Error {}

export const endpointSchema = z.object({
  url: z.string().trim().min(1).max(2000),
  description: z.string().trim().max(200).optional(),
  /** Empty: every event. */
  events: z.array(z.string()).max(WEBHOOK_EVENT_TYPES.length).default([]),
});
export type EndpointInput = z.input<typeof endpointSchema>;

function clean(raw: EndpointInput) {
  const d = endpointSchema.parse(raw);
  let url: string;
  try {
    url = validateWebhookUrl(d.url);
  } catch (e) {
    if (e instanceof WebhookUrlError) throw new WebhookInputError(e.message);
    throw e;
  }
  const events = [...new Set(d.events)];
  const unknown = events.find((e) => !isWebhookEventType(e));
  if (unknown) throw new WebhookInputError(`Unknown event: ${unknown}`);
  // Every event selected is the same as "all", and keeps future events flowing.
  return {
    url,
    description: d.description || null,
    events: events.length === WEBHOOK_EVENT_TYPES.length ? [] : events,
  };
}

async function owned(orgId: string, id: string) {
  const ep = await prisma.webhookEndpoint.findFirst({ where: { id, organizationId: orgId } });
  if (!ep) throw new WebhookInputError("Endpoint not found.");
  return ep;
}

/** Returns the signing secret, which is shown to the admin once. */
export async function createEndpoint(orgId: string, raw: EndpointInput) {
  const d = clean(raw);
  if ((await prisma.webhookEndpoint.count({ where: { organizationId: orgId } })) >= MAX_ENDPOINTS)
    throw new WebhookInputError(`You can have up to ${MAX_ENDPOINTS} endpoints.`);
  const secret = generateWebhookSecret();
  const endpoint = await prisma.webhookEndpoint.create({
    data: { organizationId: orgId, ...d, secretEncrypted: encryptSecret(secret) },
  });
  return { endpoint, secret };
}

export async function updateEndpoint(orgId: string, id: string, raw: EndpointInput) {
  await owned(orgId, id);
  return prisma.webhookEndpoint.update({ where: { id }, data: clean(raw) });
}

export async function setEndpointEnabled(orgId: string, id: string, enabled: boolean) {
  await owned(orgId, id);
  await prisma.webhookEndpoint.update({ where: { id }, data: { enabled } });
}

export async function rotateEndpointSecret(orgId: string, id: string): Promise<string> {
  await owned(orgId, id);
  const secret = generateWebhookSecret();
  await prisma.webhookEndpoint.update({
    where: { id },
    data: { secretEncrypted: encryptSecret(secret) },
  });
  return secret;
}

export async function deleteEndpoint(orgId: string, id: string) {
  await owned(orgId, id);
  await prisma.webhookEndpoint.delete({ where: { id } });
}

/** Sends a `webhook.test` event now and reports what the endpoint answered. */
export async function sendTestEvent(orgId: string, id: string): Promise<SendResult> {
  const ep = await owned(orgId, id);
  if (!ep.enabled) throw new WebhookInputError("Turn the endpoint on first.");
  const messageId = `msg_${randomUUID().replace(/-/g, "")}`;
  const d = await prisma.webhookDelivery.create({
    data: {
      endpointId: id,
      messageId,
      eventKey: `${TEST_EVENT}:${messageId}`,
      eventType: TEST_EVENT,
      payload: {
        id: messageId,
        type: TEST_EVENT,
        createdAt: new Date().toISOString(),
        data: { message: "Test event from your booking site. No action needed." },
      },
      // A single attempt, made below; never picked up or retried by the sweep.
      nextAttemptAt: null,
    },
  });
  const res = await attemptDelivery(d.id, { force: true });
  if (!res?.ok)
    await prisma.webhookDelivery.update({
      where: { id: d.id },
      data: { status: "FAILED", nextAttemptAt: null },
    });
  return res ?? { ok: false, status: null, error: "Not sent" };
}

/** Sends a delivery again now, with a fresh retry schedule if it fails. Same `webhook-id`. */
export async function resendDelivery(orgId: string, deliveryId: string): Promise<SendResult> {
  const d = await prisma.webhookDelivery.findFirst({
    where: { id: deliveryId, endpoint: { organizationId: orgId } },
  });
  if (!d) throw new WebhookInputError("Delivery not found.");
  await prisma.webhookDelivery.update({
    where: { id: d.id },
    data: { status: "PENDING", attempts: 0, nextAttemptAt: new Date() },
  });
  return (
    (await attemptDelivery(d.id, { force: true })) ?? {
      ok: false,
      status: null,
      error: "Already being sent",
    }
  );
}

export const DELIVERY_RETENTION_DAYS = 30;

/** Deletes finished deliveries older than the retention window. */
export async function pruneDeliveries(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - DELIVERY_RETENTION_DAYS * 86_400_000);
  const { count } = await prisma.webhookDelivery.deleteMany({
    where: { status: { in: ["SUCCEEDED", "FAILED"] }, createdAt: { lt: cutoff } },
  });
  return count;
}
