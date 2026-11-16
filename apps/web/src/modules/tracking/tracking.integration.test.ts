/**
 * Live tracking integration tests against the local database. No Mapbox token, so ETAs are the
 * straight-line estimate. Skipped when DATABASE_URL is unset.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkIn, goEnRoute } from "@/modules/cleaner/service";
import { cleanerFixtures } from "@/modules/cleaner/test-fixtures";
import { prisma } from "@/modules/db/client";
import { notifyCustomerTracking } from "@/modules/jobs/tasks/notify";
import { getTrackingView, purgeLocations, recordLocations } from "./service";

const enabled = !!process.env.DATABASE_URL;
const fx = cleanerFixtures(`trk${Date.now().toString(36)}`, 8500);
const HOME = { lat: 43.6426, lng: -79.3871 }; // the fixture address
const FAR = { lat: 43.7254, lng: -79.4522 }; // ~10 km away
const NEAR = { lat: 43.6435, lng: -79.3875 }; // ~100 m away

/** An accepted job a few days out, so the arrival window is still ahead. */
async function onTheWay(position: { lat: number; lng: number } | null = FAR) {
  const c = await fx.makeCleaner();
  const actor = await fx.actorFor(c.id);
  const { job } = await fx.makeJob(c.id, "ACCEPTED", { daysAhead: 2 });
  const r = await goEnRoute(actor, job.id, position);
  if (!r.ok) throw new Error(r.message);
  const a = await prisma.assignment.findUniqueOrThrow({
    where: { jobId_cleanerId: { jobId: job.id, cleanerId: c.id } },
  });
  return { c, actor, job, a, token: r.data.trackingToken };
}

const ping = (p: { lat: number; lng: number }, at = new Date()) => ({
  ...p,
  accuracyM: 10,
  recordedAt: at.toISOString(),
});

describe.skipIf(!enabled)("live tracking (integration)", () => {
  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;
  });
  afterAll(fx.cleanup);

  it("on my way issues a link with an ETA and the cleaner's position", async () => {
    const { a, token } = await onTheWay();
    expect(a.trackingToken).toBe(token);
    expect(a.etaAt).not.toBeNull();
    const minutes = (a.etaAt!.getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(15);
    expect(minutes).toBeLessThan(35);

    const view = await getTrackingView(token);
    expect(view).toMatchObject({
      status: "on_the_way",
      cleanerLocation: { lat: FAR.lat, lng: FAR.lng },
      home: HOME,
    });
    expect(await getTrackingView("not-a-real-token-123456")).toBeNull();
    expect(await getTrackingView("bad token!")).toBeNull();
  });

  it("works without a position: link but no ETA yet", async () => {
    const { a, token } = await onTheWay(null);
    expect(a.etaAt).toBeNull();
    expect((await getTrackingView(token))?.cleanerLocation).toBeNull();
  });

  it("records pings, ignores stale ones, and flags arriving once", async () => {
    const { a } = await onTheWay();
    const stale = await recordLocations(a.id, [ping(NEAR, new Date(Date.now() - 2 * 3600_000))]);
    expect(stale.tracking).toBe(true);
    expect(await prisma.locationPing.count({ where: { assignmentId: a.id } })).toBe(0);

    const near = await recordLocations(a.id, [
      ping(FAR, new Date(Date.now() - 60_000)),
      ping(NEAR),
    ]);
    expect(near.tracking).toBe(true);
    expect(await prisma.locationPing.count({ where: { assignmentId: a.id } })).toBe(2);
    const after = await prisma.assignment.findUniqueOrThrow({ where: { id: a.id } });
    expect(after.arrivingNotifiedAt).not.toBeNull();
    expect(after.lastLat).toBe(NEAR.lat);
    const firstArriving = after.arrivingNotifiedAt!.getTime();
    await recordLocations(a.id, [ping(NEAR)]);
    expect(
      (
        await prisma.assignment.findUniqueOrThrow({ where: { id: a.id } })
      ).arrivingNotifiedAt!.getTime(),
    ).toBe(firstArriving);
  });

  it("flags running late when the ETA passes the arrival window", async () => {
    const { a, job } = await onTheWay();
    // Pretend it's just before the window closes: a 25-min drive can't make it.
    const now = new Date(job.scheduledEndAt.getTime() - 5 * 60_000);
    await recordLocations(a.id, [ping(FAR, now)], now);
    const after = await prisma.assignment.findUniqueOrThrow({ where: { id: a.id } });
    expect(after.lateNotifiedAt).not.toBeNull();
  });

  it("stops at check-in: no more pings, no location on the page", async () => {
    const { a, actor, job, token } = await onTheWay();
    expect((await checkIn(actor, job.id, NEAR)).ok).toBe(true);
    expect(await recordLocations(a.id, [ping(NEAR)])).toEqual({ tracking: false, etaAt: null });
    const view = await getTrackingView(token);
    expect(view).toMatchObject({ status: "arrived", cleanerLocation: null, etaAt: null });
  });

  it("tells the customer once per milestone", async () => {
    const { a, job } = await onTheWay();
    expect(await notifyCustomerTracking(a.id, "en_route")).toEqual({ sent: true });
    await notifyCustomerTracking(a.id, "en_route");
    const rows = await prisma.notification.findMany({
      where: { jobId: job.id, templateKey: "customer.tracking.en_route" },
    });
    expect(rows.map((r) => r.channel).sort()).toEqual(["EMAIL", "SMS"]);
  });

  it("purges pings after 7 days", async () => {
    const { a } = await onTheWay();
    await recordLocations(a.id, [ping(FAR)]);
    const later = new Date(Date.now() + 8 * 86_400_000);
    expect(await purgeLocations(later)).toBeGreaterThanOrEqual(1);
    expect(await prisma.locationPing.count({ where: { assignmentId: a.id } })).toBe(0);
    expect((await prisma.assignment.findUniqueOrThrow({ where: { id: a.id } })).lastLat).toBeNull();
  });
});
