/**
 * Outgoing webhooks against the database: events are recorded with the change that caused them,
 * delivered signed, retried on failure, and deduplicated. Skipped when DATABASE_URL is unset.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { Webhook } from "standardwebhooks";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanerFixtures } from "@/modules/cleaner/test-fixtures";
import { prisma } from "@/modules/db/client";
import { transitionJob } from "@/modules/jobs/state-machine";
import { MAX_ATTEMPTS, attemptDelivery, deliverDue } from "./deliver";
import {
  createEndpoint,
  resendDelivery,
  sendTestEvent,
  setEndpointEnabled,
  updateEndpoint,
} from "./manage";
import { recordPaymentEvent } from "./queue";

const enabled = !!process.env.DATABASE_URL;
const tag = `whk${Date.now().toString(36)}`;
const { makeCleaner, makeJob, cleanup } = cleanerFixtures(tag, 7400);

type Received = { headers: http.IncomingHttpHeaders; body: string };

describe.skipIf(!enabled)("outgoing webhooks (integration)", () => {
  let server: http.Server;
  let url: string;
  let received: Received[] = [];
  let respondWith = 200;
  let orgId: string;
  let endpointId: string;
  let secret: string;

  beforeAll(async () => {
    vi.stubEnv("WEBHOOKS_ALLOW_PRIVATE", "1");
    server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        received.push({ headers: req.headers, body });
        res.writeHead(respondWith);
        res.end();
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
    orgId = (await prisma.region.findFirstOrThrow({ where: { slug: "toronto" } })).organizationId;
    // Start from a clean slate: earlier runs may have left due deliveries.
    await prisma.webhookDelivery.updateMany({
      where: { status: "PENDING" },
      data: { status: "FAILED", nextAttemptAt: null },
    });
    const created = await createEndpoint(orgId, { url, description: tag, events: [] });
    endpointId = created.endpoint.id;
    secret = created.secret;
  });

  beforeEach(() => {
    received = [];
    respondWith = 200;
  });

  afterAll(async () => {
    await prisma.webhookEndpoint.deleteMany({ where: { description: tag } });
    await cleanup();
    server.close();
    vi.unstubAllEnvs();
  });

  const deliveries = (eventType: string) =>
    prisma.webhookDelivery.findMany({ where: { endpointId, eventType } });

  it("records a job event in the transition's transaction and delivers it signed", async () => {
    const c = await makeCleaner();
    const { job } = await makeJob(c.id, "ACCEPTED");
    await prisma.$transaction((tx) => transitionJob(tx, job.id, "IN_PROGRESS", { type: "ADMIN" }));
    const [d] = await deliveries("job.started");
    expect(d).toMatchObject({ status: "PENDING", attempts: 0 });

    expect((await deliverDue()).sent).toBeGreaterThanOrEqual(1);
    const got = received.find((r) => r.headers["webhook-id"] === d.messageId)!;
    expect(got).toBeDefined();
    const event = new Webhook(secret).verify(got.body, got.headers as Record<string, string>) as {
      type: string;
      data: { id: string; status: string; bookingNumber: string; cleaners: { id: string }[] };
    };
    expect(event.type).toBe("job.started");
    expect(event.data).toMatchObject({ id: job.id, status: "IN_PROGRESS" });
    expect(event.data.cleaners.map((x) => x.id)).toEqual([c.id]);
    expect(await prisma.webhookDelivery.findUnique({ where: { id: d.id } })).toMatchObject({
      status: "SUCCEEDED",
      attempts: 1,
      lastStatusCode: 200,
    });
  });

  it("records nothing when the transaction rolls back", async () => {
    const c = await makeCleaner();
    const { job } = await makeJob(c.id, "ACCEPTED");
    await expect(
      prisma.$transaction(async (tx) => {
        await transitionJob(tx, job.id, "IN_PROGRESS", { type: "ADMIN" });
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    const rows = await prisma.webhookDelivery.findMany({ where: { endpointId } });
    expect(rows.filter((r) => (r.payload as { data: { id: string } }).data.id === job.id)).toEqual(
      [],
    );
  });

  it("only sends subscribed events", async () => {
    await updateEndpoint(orgId, endpointId, { url, description: tag, events: ["job.completed"] });
    try {
      const c = await makeCleaner();
      const { job } = await makeJob(c.id, "ACCEPTED");
      await prisma.$transaction((tx) => transitionJob(tx, job.id, "EN_ROUTE", { type: "ADMIN" }));
      const enRoute = await deliveries("job.en_route");
      expect(enRoute.some((d) => (d.payload as { data: { id: string } }).data.id === job.id)).toBe(
        false,
      );
    } finally {
      await updateEndpoint(orgId, endpointId, { url, description: tag, events: [] });
    }
  });

  it("retries failures with backoff, then gives up", async () => {
    const c = await makeCleaner();
    const { job } = await makeJob(c.id, "ACCEPTED");
    await prisma.$transaction((tx) => transitionJob(tx, job.id, "NO_SHOW", { type: "ADMIN" }));
    const [d] = await deliveries("job.no_show");
    respondWith = 503;

    const t0 = Date.now();
    expect(await attemptDelivery(d.id)).toMatchObject({ ok: false, status: 503 });
    let row = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: d.id } });
    expect(row.status).toBe("PENDING");
    expect(row.nextAttemptAt!.getTime() - t0).toBeGreaterThanOrEqual(55_000);
    // Not due yet: a sweep leaves it alone.
    expect(await attemptDelivery(d.id)).toBeNull();

    // Exhaust the remaining attempts.
    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      await prisma.webhookDelivery.update({
        where: { id: d.id },
        data: { nextAttemptAt: new Date() },
      });
      await attemptDelivery(d.id);
    }
    row = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: d.id } });
    expect(row).toMatchObject({ status: "FAILED", attempts: MAX_ATTEMPTS, nextAttemptAt: null });

    // An admin resend starts over and succeeds, with the same webhook-id.
    respondWith = 200;
    expect(await resendDelivery(orgId, d.id)).toMatchObject({ ok: true });
    expect(received.at(-1)!.headers["webhook-id"]).toBe(d.messageId);
    expect(await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: d.id } })).toMatchObject({
      status: "SUCCEEDED",
      attempts: 1,
    });
  }, 30_000);

  it("records the same payment event once", async () => {
    const c = await makeCleaner();
    const { job } = await makeJob(c.id, "ACCEPTED");
    const charge = await prisma.charge.create({
      data: {
        organizationId: orgId,
        customerId: job.customerId,
        jobId: job.id,
        type: "SERVICE",
        amountCents: 10000,
        cardCents: 10000,
        status: "REFUNDED",
        idempotencyKey: `${tag}:${job.id}`,
      },
    });
    try {
      await recordPaymentEvent(prisma, charge.id, "payment.refunded", { refundedCents: 10000 });
      await recordPaymentEvent(prisma, charge.id, "payment.refunded", { refundedCents: 10000 });
      const rows = (await deliveries("payment.refunded")).filter(
        (d) => (d.payload as { data: { id: string } }).data.id === charge.id,
      );
      expect(rows).toHaveLength(1);
      expect((rows[0].payload as { data: object }).data).toMatchObject({
        amountCents: 10000,
        bookingNumber: expect.any(String),
      });
    } finally {
      await prisma.webhookDelivery.deleteMany({
        where: { endpointId, eventType: "payment.refunded" },
      });
      await prisma.charge.delete({ where: { id: charge.id } });
    }
  });

  it("sends a test event, and nothing to a disabled endpoint", async () => {
    expect(await sendTestEvent(orgId, endpointId)).toMatchObject({ ok: true, status: 200 });
    expect(JSON.parse(received.at(-1)!.body)).toMatchObject({ type: "webhook.test" });

    await setEndpointEnabled(orgId, endpointId, false);
    try {
      const c = await makeCleaner();
      const { job } = await makeJob(c.id, "ACCEPTED");
      await prisma.$transaction((tx) => transitionJob(tx, job.id, "CANCELLED", { type: "ADMIN" }));
      const rows = (await deliveries("job.cancelled")).filter(
        (d) => (d.payload as { data: { id: string } }).data.id === job.id,
      );
      expect(rows).toEqual([]);
    } finally {
      await setEndpointEnabled(orgId, endpointId, true);
    }
  });
});
