/**
 * Integration tests against the local database (docker compose). Skipped when DATABASE_URL is unset.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/modules/db/client";
import {
  addLocalDays,
  localDateToDateColumn,
  todayIn,
  weekdayOf,
  zonedToInstant,
} from "@/modules/shared/dates";
import { chargeCompletedJob } from "./charges";
import { runCutoff } from "./cutoff";
import { runReminders } from "./reminders";
import { runSeriesMaterialization } from "./series";

const enabled = !!process.env.DATABASE_URL;
const ids = { customer: "", booking: "", jobs: [] as string[] };

async function seedBooking(opts: { startInHours: number; frequency?: "ONE_TIME" | "BIWEEKLY" }) {
  const region = await prisma.region.findFirstOrThrow({
    where: { slug: "toronto" },
    include: { windows: true },
  });
  const service = await prisma.service.findFirstOrThrow({
    where: { organizationId: region.organizationId, slug: "standard" },
  });
  const table = await prisma.pricingTable.findFirstOrThrow({
    where: { organizationId: region.organizationId, regionId: null, status: "PUBLISHED" },
  });
  const customer = await prisma.customer.create({
    data: {
      organizationId: region.organizationId,
      firstName: "Task",
      lastName: "Test",
      email: `task-${Date.now()}@example.com`,
      phone: "+14165550999",
    },
  });
  const address = await prisma.address.create({
    data: {
      customerId: customer.id,
      regionId: region.id,
      line1: "1 Test St",
      city: "Toronto",
      province: "ON",
      postalCode: "M5V 2T6",
      fsa: "M5V",
    },
  });
  const window = region.windows[0];
  const start = new Date(Date.now() + opts.startInHours * 3600_000);
  const date = todayIn(region.timezone, start);
  const scheduledStartAt = zonedToInstant(date, window.startLocal, region.timezone);
  const input = {
    regionId: region.id,
    province: "ON",
    serviceSlug: "standard",
    pricingModel: "FLAT",
    bedrooms: 2,
    bathrooms: 1,
    extras: [],
    frequency: opts.frequency ?? "ONE_TIME",
    isFirstOccurrence: true,
    serviceDate: date,
  };
  const booking = await prisma.booking.create({
    data: {
      organizationId: region.organizationId,
      regionId: region.id,
      customerId: customer.id,
      addressId: address.id,
      serviceId: service.id,
      bookingNumber: `MS-T${Date.now().toString(36).toUpperCase().slice(-5)}`,
      frequency: opts.frequency ?? "ONE_TIME",
      anchorDate: localDateToDateColumn(date),
      weekday: weekdayOf(date),
      windowId: window.id,
      bedrooms: 2,
      bathrooms: "1",
      generatedThrough: localDateToDateColumn(date),
    },
  });
  const quote = await prisma.priceQuote.create({
    data: {
      bookingId: booking.id,
      regionId: region.id,
      pricingTableId: table.id,
      engineVersion: "test",
      inputs: input,
      lines: [],
      subtotalCents: 13900,
      discountCents: 0,
      taxableCents: 13900,
      taxCents: 1807,
      totalCents: 15707,
      estimatedMinutes: 160,
    },
  });
  const job = await prisma.job.create({
    data: {
      organizationId: region.organizationId,
      regionId: region.id,
      bookingId: booking.id,
      customerId: customer.id,
      sequenceNumber: 1,
      status: "CONFIRMED",
      scheduledDate: localDateToDateColumn(date),
      windowStartLocal: window.startLocal,
      windowEndLocal: window.endLocal,
      timezone: region.timezone,
      scheduledStartAt,
      scheduledEndAt: zonedToInstant(date, window.endLocal, region.timezone),
      estimatedMinutes: 160,
      serviceId: service.id,
      addressId: address.id,
      addressSnapshot: {},
      bedrooms: 2,
      bathrooms: "1",
      activeQuoteId: quote.id,
    },
  });
  await prisma.priceQuote.update({ where: { id: quote.id }, data: { jobId: job.id } });
  ids.customer = customer.id;
  ids.booking = booking.id;
  ids.jobs.push(job.id);
  return { region, booking, job, scheduledStartAt };
}

describe.skipIf(!enabled)("background tasks (integration)", () => {
  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;
  });
  afterAll(async () => {
    if (ids.customer) {
      await prisma.notification.deleteMany({ where: { recipientId: ids.customer } });
      await prisma.customer.delete({ where: { id: ids.customer } }).catch(() => {});
    }
  });

  it("sends a 1-day reminder once, keyed by scheduled date", async () => {
    const { job, scheduledStartAt } = await seedBooking({ startInHours: 30 });
    const now = new Date(scheduledStartAt.getTime() - 24 * 3600_000);
    const first = await runReminders(now);
    expect(first.sent).toBeGreaterThanOrEqual(1);
    const rows = await prisma.notification.findMany({
      where: { jobId: job.id, templateKey: "job.reminder_1d" },
    });
    expect(rows.map((r) => r.channel).sort()).toEqual(["EMAIL", "SMS"]);
    const again = await runReminders(now);
    const after = await prisma.notification.count({
      where: { jobId: job.id, templateKey: "job.reminder_1d" },
    });
    expect(after).toBe(rows.length);
    expect(again.sent).toBe(0);
  });

  it("locks the price at the late-cancel cutoff and snapshots the address", async () => {
    const { job, scheduledStartAt } = await seedBooking({ startInHours: 30 });
    const early = await runCutoff(new Date(scheduledStartAt.getTime() - 30 * 3600_000));
    expect(
      (await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).priceLockedAt,
    ).toBeNull();
    void early;
    await runCutoff(new Date(scheduledStartAt.getTime() - 23 * 3600_000));
    const locked = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(locked.priceLockedAt).not.toBeNull();
    expect((locked.addressSnapshot as { line1: string }).line1).toBe("1 Test St");
    expect(locked.activeQuoteId).not.toBeNull();
  });

  it("materializes a recurring series 8 weeks ahead", async () => {
    const { booking } = await seedBooking({ startInHours: 48, frequency: "BIWEEKLY" });
    const res = await runSeriesMaterialization();
    expect(res.bookings).toBeGreaterThanOrEqual(1);
    const jobs = await prisma.job.findMany({
      where: { bookingId: booking.id },
      orderBy: { sequenceNumber: "asc" },
    });
    expect(jobs.length).toBeGreaterThanOrEqual(4);
    expect(jobs.map((j) => j.sequenceNumber)).toEqual(jobs.map((_, i) => i + 1));
    const b = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(
      b.generatedThrough!.toISOString().slice(0, 10) >=
        addLocalDays(todayIn("America/Toronto"), 50),
    ).toBe(true);
    // Idempotent: running again adds nothing.
    await runSeriesMaterialization();
    expect(await prisma.job.count({ where: { bookingId: booking.id } })).toBe(jobs.length);
  });

  it("charge task skips jobs that are not completed and reports no Stripe when unconfigured", async () => {
    const { job } = await seedBooking({ startInHours: 2 });
    expect((await chargeCompletedJob(job.id)).status).toBe("skipped:not-completed");
    await prisma.job.update({
      where: { id: job.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    const res = await chargeCompletedJob(job.id);
    expect(res.status).toMatch(/^(skipped:no-stripe|charged|failed)/);
  });
});
