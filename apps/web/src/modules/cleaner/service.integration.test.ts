/**
 * Integration tests for the cleaner job rules against the local database (docker compose, seeded).
 * Skipped when DATABASE_URL is unset.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/modules/db/client";
import { deleteObject } from "@/modules/storage";
import { localDateToDateColumn, todayIn, weekdayOf, zonedToInstant } from "@/modules/shared/dates";
import {
  addPhoto,
  checkIn,
  checkOut,
  getJobDetail,
  goEnRoute,
  resolveCleanerActor,
  respondToOffer,
  setChecklistItem,
  type CleanerActor,
} from "./service";

const enabled = !!process.env.DATABASE_URL;
const tag = `svc${Date.now().toString(36)}`;
const created = { users: [] as string[], cleaners: [] as string[], customers: [] as string[] };
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);

async function region() {
  return prisma.region.findFirstOrThrow({ where: { slug: "toronto" }, include: { windows: true } });
}

async function makeCleaner(status: "ACTIVE" | "SUSPENDED" = "ACTIVE") {
  const r = await region();
  const n = created.cleaners.length;
  const user = await prisma.user.create({
    data: { organizationId: r.organizationId, email: `${tag}-${n}@example.com`, status: "ACTIVE" },
  });
  const cleaner = await prisma.cleaner.create({
    data: {
      organizationId: r.organizationId,
      userId: user.id,
      firstName: `Svc${n}`,
      lastName: "Test",
      email: user.email,
      phone: `+1416555${String(7000 + n)}`,
      status,
      homeRegionId: r.id,
      payType: "FLAT_PER_JOB",
      payRateCents: 5000,
    },
  });
  created.users.push(user.id);
  created.cleaners.push(cleaner.id);
  return cleaner;
}

/** A confirmed job today with a single required checklist item, offered or assigned to a cleaner. */
async function makeJob(cleanerId: string, assignment: "OFFERED" | "ACCEPTED") {
  const r = await region();
  const service = await prisma.service.findFirstOrThrow({
    where: { organizationId: r.organizationId, slug: "standard" },
  });
  const customer = await prisma.customer.create({
    data: {
      organizationId: r.organizationId,
      firstName: "Svc",
      lastName: "Customer",
      email: `${tag}-c${created.customers.length}@example.com`,
      phone: "+14165550998",
    },
  });
  created.customers.push(customer.id);
  const address = await prisma.address.create({
    data: {
      customerId: customer.id,
      regionId: r.id,
      line1: "1 Test St",
      city: "Toronto",
      province: "ON",
      postalCode: "M5V 2T6",
      postalPrefix: "M5V",
      lat: 43.6426,
      lng: -79.3871,
    },
  });
  const window = r.windows[0];
  const date = todayIn(r.timezone);
  const booking = await prisma.booking.create({
    data: {
      organizationId: r.organizationId,
      regionId: r.id,
      customerId: customer.id,
      addressId: address.id,
      serviceId: service.id,
      bookingNumber: `MS-S${Date.now().toString(36).toUpperCase().slice(-6)}${created.customers.length}`,
      frequency: "ONE_TIME",
      anchorDate: localDateToDateColumn(date),
      weekday: weekdayOf(date),
      windowId: window.id,
      bedrooms: 2,
      bathrooms: "1",
      generatedThrough: localDateToDateColumn(date),
    },
  });
  const job = await prisma.job.create({
    data: {
      organizationId: r.organizationId,
      regionId: r.id,
      bookingId: booking.id,
      customerId: customer.id,
      sequenceNumber: 1,
      status: assignment === "ACCEPTED" ? "ASSIGNED" : "CONFIRMED",
      scheduledDate: localDateToDateColumn(date),
      windowStartLocal: window.startLocal,
      windowEndLocal: window.endLocal,
      timezone: r.timezone,
      scheduledStartAt: zonedToInstant(date, window.startLocal, r.timezone),
      scheduledEndAt: zonedToInstant(date, window.endLocal, r.timezone),
      estimatedMinutes: 120,
      serviceId: service.id,
      addressId: address.id,
      addressSnapshot: { line1: "1 Test St", city: "Toronto", postalCode: "M5V 2T6" },
      bedrooms: 2,
      bathrooms: "1",
      checklist: {
        create: [{ section: "Kitchen", label: "Wipe counters", sortOrder: 1, requiresPhoto: true }],
      },
    },
    include: { checklist: true },
  });
  await prisma.assignment.create({
    data: { jobId: job.id, cleanerId, role: "LEAD", status: assignment },
  });
  return { job, itemId: job.checklist[0].id };
}

async function actorFor(cleanerId: string): Promise<CleanerActor> {
  const c = await prisma.cleaner.findUniqueOrThrow({ where: { id: cleanerId } });
  const actor = await resolveCleanerActor(c.userId!);
  if (!actor) throw new Error("expected an active cleaner");
  return actor;
}

describe.skipIf(!enabled)("cleaner service (integration)", () => {
  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;
  });
  afterAll(async () => {
    const jobs = await prisma.job.findMany({
      where: { customerId: { in: created.customers } },
      select: { id: true },
    });
    const jobIds = jobs.map((j) => j.id);
    await prisma.cleanerEarning.deleteMany({ where: { jobId: { in: jobIds } } });
    await prisma.jobEvent.deleteMany({ where: { jobId: { in: jobIds } } });
    const photos = await prisma.jobPhoto.findMany({ where: { jobId: { in: jobIds } } });
    for (const p of photos) await deleteObject(p.storageKey).catch(() => {});
    await prisma.jobPhoto.deleteMany({ where: { jobId: { in: jobIds } } });
    await prisma.jobChecklistItem.deleteMany({ where: { jobId: { in: jobIds } } });
    await prisma.assignment.deleteMany({ where: { jobId: { in: jobIds } } });
    await prisma.job.deleteMany({ where: { id: { in: jobIds } } });
    await prisma.booking.deleteMany({ where: { customerId: { in: created.customers } } });
    await prisma.address.deleteMany({ where: { customerId: { in: created.customers } } });
    await prisma.customer.deleteMany({ where: { id: { in: created.customers } } });
    await prisma.cleaner.deleteMany({ where: { id: { in: created.cleaners } } });
    await prisma.user.deleteMany({ where: { id: { in: created.users } } });
  });

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
