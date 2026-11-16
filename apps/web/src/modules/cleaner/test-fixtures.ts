/**
 * Test data for cleaner integration tests: cleaners, jobs and cleanup. Not a test file itself.
 * Each suite creates its own fixtures with a unique tag so suites never share rows.
 */
import { prisma } from "@/modules/db/client";
import { deleteObject } from "@/modules/storage";
import { localDateToDateColumn, todayIn, weekdayOf, zonedToInstant } from "@/modules/shared/dates";
import { resolveCleanerActor, type CleanerActor } from "./service";

/** Smallest buffer that passes the JPEG magic-byte check. */
export const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);

/** phoneBlock: 4-digit prefix block (e.g. 7000) so suites never reuse a phone number. */
export function cleanerFixtures(tag: string, phoneBlock: number) {
  const created = { users: [] as string[], cleaners: [] as string[], customers: [] as string[] };

  async function region() {
    return prisma.region.findFirstOrThrow({
      where: { slug: "toronto" },
      include: { windows: true },
    });
  }

  async function makeCleaner(status: "ACTIVE" | "SUSPENDED" = "ACTIVE") {
    const r = await region();
    const n = created.cleaners.length;
    const user = await prisma.user.create({
      data: {
        organizationId: r.organizationId,
        email: `${tag}-${n}@example.com`,
        status: "ACTIVE",
      },
    });
    const cleaner = await prisma.cleaner.create({
      data: {
        organizationId: r.organizationId,
        userId: user.id,
        firstName: `Svc${n}`,
        lastName: "Test",
        email: user.email,
        phone: `+1416555${String(phoneBlock + n)}`,
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
          create: [
            { section: "Kitchen", label: "Wipe counters", sortOrder: 1, requiresPhoto: true },
          ],
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

  async function cleanup() {
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
  }

  return { makeCleaner, makeJob, actorFor, cleanup, created };
}
