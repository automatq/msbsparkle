/**
 * REST API (/api/v1) against the database: key auth, revocation, organization isolation,
 * filters, pagination and response shapes. Skipped when DATABASE_URL is unset.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApiKey, revokeApiKey } from "@/modules/api/keys";
import { cleanerFixtures } from "@/modules/cleaner/test-fixtures";
import { prisma } from "@/modules/db/client";
import * as booking from "./bookings/[id]/route";
import * as bookings from "./bookings/route";
import * as customer from "./customers/[id]/route";
import * as customers from "./customers/route";
import * as job from "./jobs/[id]/route";
import * as jobs from "./jobs/route";
import * as me from "./me/route";
import * as payments from "./payments/route";

const enabled = !!process.env.DATABASE_URL;
const tag = `apik${Date.now().toString(36)}`;
const fx = cleanerFixtures(tag, 7600);

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- route params differ per handler
type Handler = (req: Request, ctx: { params: Promise<any> }) => Promise<Response>;

async function call(
  handler: { GET: Handler },
  opts: { key?: string | null; query?: string; params?: Record<string, string> } = {},
) {
  const headers: Record<string, string> = {};
  if (opts.key) headers.authorization = `Bearer ${opts.key}`;
  const req = new Request(`http://localhost/api/v1/x${opts.query ?? ""}`, { headers });
  const res = await handler.GET(req, { params: Promise.resolve(opts.params ?? {}) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- assertions inspect the JSON
  return { status: res.status, headers: res.headers, body: (await res.json()) as any };
}

describe.skipIf(!enabled)("REST API v1 (integration)", () => {
  let orgId: string;
  let key: string;
  let keyId: string;
  let otherOrgId: string;
  let otherKey: string;
  let jobId: string;
  let bookingId: string;
  let bookingNumber: string;
  let customerId: string;

  beforeAll(async () => {
    orgId = (await prisma.region.findFirstOrThrow({ where: { slug: "toronto" } })).organizationId;
    ({ key, id: keyId } = await createApiKey(orgId, `${tag} main`, null));
    otherOrgId = (
      await prisma.organization.create({ data: { name: `${tag} other`, slug: `${tag}-other` } })
    ).id;
    ({ key: otherKey } = await createApiKey(otherOrgId, `${tag} other`, null));

    const c = await fx.makeCleaner();
    const made = await fx.makeJob(c.id, "ACCEPTED", { daysAhead: 3 });
    jobId = made.job.id;
    const j = await prisma.job.findUniqueOrThrow({
      where: { id: jobId },
      include: { booking: true },
    });
    bookingId = j.bookingId;
    bookingNumber = j.booking.bookingNumber;
    customerId = j.customerId;
  });

  afterAll(async () => {
    await prisma.apiKey.deleteMany({ where: { name: { startsWith: tag } } });
    await prisma.organization.delete({ where: { id: otherOrgId } });
    await fx.cleanup();
  });

  it("rejects missing, malformed, unknown and revoked keys", async () => {
    expect((await call(me)).status).toBe(401);
    expect((await call(me, { key: "not-a-key" })).status).toBe(401);
    const unknown = await call(me, { key: `sk_${"x".repeat(43)}` });
    expect(unknown.status).toBe(401);
    expect(unknown.body.error.code).toBe("unauthorized");

    const temp = await createApiKey(orgId, `${tag} temp`, null);
    expect((await call(me, { key: temp.key })).status).toBe(200);
    await revokeApiKey(orgId, temp.id);
    expect((await call(me, { key: temp.key })).status).toBe(401);
  });

  it("describes the key and records its use", async () => {
    const r = await call(me, { key });
    expect(r.status).toBe(200);
    expect(r.body.data.key).toMatchObject({ name: `${tag} main`, prefix: key.slice(0, 10) });
    expect(r.headers.get("x-ratelimit-limit")).toBe("300");
    expect(r.headers.get("cache-control")).toBe("no-store");
    const row = await prisma.apiKey.findUniqueOrThrow({ where: { id: keyId } });
    expect(row.lastUsedAt).not.toBeNull();
    expect(row.keyHash).not.toContain(key.slice(3));
  });

  it("returns a visit by id, in the webhook shape", async () => {
    const r = await call(job, { key, params: { id: jobId } });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({
      id: jobId,
      bookingId,
      bookingNumber,
      status: "ASSIGNED",
      customer: { id: customerId },
      currency: expect.any(String),
    });
    expect(r.body.data.cleaners).toHaveLength(1);
  });

  it("finds bookings by id or number, and lists with filters", async () => {
    for (const id of [bookingId, bookingNumber.toLowerCase()]) {
      const r = await call(booking, { key, params: { id } });
      expect(r.status).toBe(200);
      expect(r.body.data.bookingNumber).toBe(bookingNumber);
    }
    const list = await call(bookings, { key, query: `?customer_id=${customerId}` });
    expect(list.body.data.map((b: { id: string }) => b.id)).toEqual([bookingId]);
    expect(list.body.nextCursor).toBeNull();

    const visits = await call(jobs, { key, query: `?booking_id=${bookingId}&status=ASSIGNED` });
    expect(visits.body.data.map((x: { id: string }) => x.id)).toEqual([jobId]);
  });

  it("paginates with a cursor", async () => {
    const first = await call(customers, { key, query: "?limit=1" });
    expect(first.body.data).toHaveLength(1);
    expect(first.body.nextCursor).toBe(first.body.data[0].id);
    const second = await call(customers, {
      key,
      query: `?limit=1&cursor=${first.body.nextCursor}`,
    });
    expect(second.body.data).toHaveLength(1);
    expect(second.body.data[0].id).not.toBe(first.body.data[0].id);
  });

  it("finds a customer by email, case-insensitively", async () => {
    const c = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    const r = await call(customers, {
      key,
      query: `?email=${encodeURIComponent(c.email.toUpperCase())}`,
    });
    expect(r.body.data.map((x: { id: string }) => x.id)).toEqual([customerId]);
    const one = await call(customer, { key, params: { id: customerId } });
    expect(one.body.data).toMatchObject({ id: customerId, email: c.email, anonymized: false });
  });

  it("never shows another company's data", async () => {
    expect((await call(job, { key: otherKey, params: { id: jobId } })).status).toBe(404);
    expect((await call(booking, { key: otherKey, params: { id: bookingNumber } })).status).toBe(
      404,
    );
    expect((await call(customer, { key: otherKey, params: { id: customerId } })).status).toBe(404);
    for (const h of [bookings, jobs, customers, payments]) {
      const r = await call(h, { key: otherKey });
      expect(r.status).toBe(200);
      expect(r.body.data).toEqual([]);
    }
  });

  it("rejects bad query parameters with 400", async () => {
    for (const [h, q] of [
      [jobs, "?from=12/01/2026"],
      [jobs, "?status=DONE"],
      [bookings, "?limit=500"],
      [payments, "?created_since=yesterday"],
    ] as const) {
      const r = await call(h, { key, query: q });
      expect(r.status).toBe(400);
      expect(r.body.error.code).toBe("invalid_request");
    }
  });
});
