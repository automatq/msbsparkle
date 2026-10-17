import { afterEach, describe, expect, it, vi } from "vitest";
import { signAccessToken } from "@/modules/auth/api-tokens";
import { prisma } from "@/modules/db/client";
import { cleanupTestCustomer, seedTestBooking } from "@/modules/testing/fixtures";
import { GET as getBooking } from "./bookings/[id]/route";
import { GET as listBookings } from "./bookings/route";
import { GET as getMe, PATCH as patchMe } from "./me/route";
import { POST as cancelVisit } from "./visits/[id]/cancel/route";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
// next-auth can't load outside Next; the API path must never fall back to the cookie session.
vi.mock("@/modules/auth/session", () => ({
  getCtx: async () => {
    throw new Error("cookie session used on the API path");
  },
}));

const customers: string[] = [];
const users: string[] = [];

afterEach(async () => {
  for (const id of customers.splice(0)) await cleanupTestCustomer(id);
  await prisma.user.deleteMany({ where: { id: { in: users.splice(0) } } });
});

/** A seeded booking whose customer can sign in to the API. */
async function seedApiCustomer() {
  const seeded = await seedTestBooking({ startInHours: 72 });
  customers.push(seeded.customer.id);
  const user = await prisma.user.create({
    data: {
      organizationId: seeded.customer.organizationId,
      email: seeded.customer.email,
      roles: { create: { role: "CUSTOMER" } },
    },
  });
  users.push(user.id);
  await prisma.customer.update({ where: { id: seeded.customer.id }, data: { userId: user.id } });
  const token = await signAccessToken({
    sub: user.id,
    orgId: user.organizationId,
    sessionVersion: user.sessionVersion,
  });
  return { ...seeded, user, token };
}

function request(token: string | null, body?: unknown) {
  return new Request("http://api.test/api/v1/account", {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("/api/v1/account (integration)", () => {
  it("rejects requests without a valid bearer token", async () => {
    expect((await listBookings(request(null))).status).toBe(401);
    expect((await listBookings(request("garbage"))).status).toBe(401);
  });

  it("rejects a token after the session version is bumped", async () => {
    const { user, token } = await seedApiCustomer();
    await prisma.user.update({
      where: { id: user.id },
      data: { sessionVersion: { increment: 1 } },
    });
    expect((await getMe(request(token))).status).toBe(401);
  });

  it("lists the customer's own bookings and visits", async () => {
    const { token, booking, job } = await seedApiCustomer();
    const res = await listBookings(request(token));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.bookings.map((b: { id: string }) => b.id)).toEqual([booking.id]);
    expect(data.visits.map((v: { id: string }) => v.id)).toEqual([job.id]);
    expect(data.visits[0]).not.toHaveProperty("internalNotes");
  });

  it("does not expose or let a customer change another customer's booking", async () => {
    const owner = await seedApiCustomer();
    const other = await seedApiCustomer();

    expect((await getBooking(request(other.token), params(owner.booking.id))).status).toBe(404);
    const res = await cancelVisit(request(other.token, {}), params(owner.job.id));
    expect(res.status).toBe(422);
    const job = await prisma.job.findUniqueOrThrow({ where: { id: owner.job.id } });
    expect(job.status).toBe("CONFIRMED");
  });

  it("cancels the customer's own visit", async () => {
    const { token, job } = await seedApiCustomer();
    const res = await cancelVisit(request(token, { reason: "plans changed" }), params(job.id));
    expect(res.status).toBe(200);
    const after = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(after.status).toBe("CANCELLED");
  });

  it("updates the profile", async () => {
    const { token, customer } = await seedApiCustomer();
    const req = new Request("http://api.test/api/v1/account/me", {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        firstName: "Renamed",
        lastName: "Person",
        phone: "4165550111",
        marketingOptIn: true,
        smsOptOut: false,
      }),
    });
    expect((await patchMe(req)).status).toBe(200);
    const after = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(after.firstName).toBe("Renamed");
  });
});
