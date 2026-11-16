/**
 * Integration tests for the cleaner job rules against the local database (docker compose, seeded).
 * Skipped when DATABASE_URL is unset.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/modules/db/client";
import {
  addPhoto,
  checkIn,
  checkOut,
  getJobDetail,
  goEnRoute,
  resolveCleanerActor,
  respondToOffer,
  setChecklistItem,
} from "./service";
import { JPEG, cleanerFixtures } from "./test-fixtures";

const enabled = !!process.env.DATABASE_URL;
const tag = `svc${Date.now().toString(36)}`;
const { makeCleaner, makeJob, actorFor, cleanup } = cleanerFixtures(tag, 7000);

describe.skipIf(!enabled)("cleaner service (integration)", () => {
  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;
  });
  afterAll(cleanup);

  it("refuses suspended cleaners", async () => {
    const c = await makeCleaner("SUSPENDED");
    expect(await resolveCleanerActor(c.userId!)).toBeNull();
  });

  it("an offered cleaner can't go en route, tick the checklist or add photos", async () => {
    const c = await makeCleaner();
    const actor = await actorFor(c.id);
    const { job, itemId } = await makeJob(c.id, "OFFERED");
    expect(await goEnRoute(actor, job.id)).toMatchObject({ ok: false, code: "PRECONDITION" });
    expect(await setChecklistItem(actor, job.id, itemId, true)).toMatchObject({
      ok: false,
      code: "PRECONDITION",
    });
    expect(await addPhoto(actor, job.id, { kind: "BEFORE", bytes: JPEG })).toMatchObject({
      ok: false,
      code: "PRECONDITION",
    });
    expect(await checkOut(actor, job.id, null)).toMatchObject({ ok: false });
    const detail = await getJobDetail(actor, job.id);
    expect(detail?.can.canSeeCustomer).toBe(false);
  });

  it("an offer can only be answered once", async () => {
    const c = await makeCleaner();
    const actor = await actorFor(c.id);
    const { job } = await makeJob(c.id, "OFFERED");
    expect(await respondToOffer(actor, job.id, true)).toMatchObject({ ok: true });
    expect(await respondToOffer(actor, job.id, false)).toMatchObject({
      ok: false,
      code: "CONFLICT",
    });
    expect((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("ASSIGNED");
  });

  it("another cleaner's job looks like it doesn't exist", async () => {
    const owner = await makeCleaner();
    const other = await actorFor((await makeCleaner()).id);
    const { job } = await makeJob(owner.id, "ACCEPTED");
    expect(await getJobDetail(other, job.id)).toBeNull();
    expect(await checkIn(other, job.id, null)).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("runs a job end to end: on my way, check in, checklist, photo, check out, earning", async () => {
    const c = await makeCleaner();
    const actor = await actorFor(c.id);
    const { job, itemId } = await makeJob(c.id, "ACCEPTED");

    // Checklist is locked until check-in.
    expect(await setChecklistItem(actor, job.id, itemId, true)).toMatchObject({
      ok: false,
      code: "PRECONDITION",
    });
    expect(await goEnRoute(actor, job.id)).toMatchObject({ ok: true });
    const far = await checkIn(actor, job.id, { lat: 43.7, lng: -79.4 });
    expect(far).toMatchObject({ ok: true });
    expect(far.ok && far.warnings?.[0]).toMatch(/km from the address/);
    expect(await checkIn(actor, job.id, null)).toMatchObject({ ok: false, code: "CONFLICT" });

    // The required item blocks check-out until it's ticked.
    expect(await checkOut(actor, job.id, null)).toMatchObject({
      ok: false,
      code: "PRECONDITION",
    });
    expect(await setChecklistItem(actor, job.id, "not-an-item", true)).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await setChecklistItem(actor, job.id, itemId, true)).toMatchObject({ ok: true });

    // Retrying an upload with the same client id stores one photo.
    const clientId = `${tag}-photo-1`;
    const first = await addPhoto(actor, job.id, { kind: "AFTER", bytes: JPEG, clientId });
    const retry = await addPhoto(actor, job.id, { kind: "AFTER", bytes: JPEG, clientId });
    expect(first.ok && retry.ok && retry.data.id === first.data.id).toBe(true);
    expect(await prisma.jobPhoto.count({ where: { jobId: job.id } })).toBe(1);
    expect(
      await addPhoto(actor, job.id, { kind: "BEFORE", bytes: Buffer.from("<svg></svg>....") }),
    ).toMatchObject({ ok: false, code: "INVALID" });

    const out = await checkOut(actor, job.id, null);
    expect(out).toMatchObject({ ok: true, data: { completed: true } });
    expect((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe(
      "COMPLETED",
    );
    const earning = await prisma.cleanerEarning.findFirstOrThrow({ where: { jobId: job.id } });
    expect(earning.totalCents).toBe(5000);

    // Closed job: nothing else changes.
    expect(await addPhoto(actor, job.id, { kind: "AFTER", bytes: JPEG })).toMatchObject({
      ok: false,
      code: "CONFLICT",
    });
    expect(await setChecklistItem(actor, job.id, itemId, false)).toMatchObject({ ok: false });
  });
});
