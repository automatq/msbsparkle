/** Test-only helpers that create and remove bookings directly in the database. */
import { prisma } from "@/modules/db/client";
import { localDateToDateColumn, todayIn, weekdayOf, zonedToInstant } from "@/modules/shared/dates";

export async function seedTestBooking(opts: {
  startInHours: number;
  frequency?: "ONE_TIME" | "WEEKLY" | "BIWEEKLY" | "EVERY_4_WEEKS";
  bedrooms?: number;
}) {
  const region = await prisma.region.findFirstOrThrow({
    where: { slug: "toronto" },
    include: { windows: { orderBy: { sortOrder: "asc" } } },
  });
  const service = await prisma.service.findFirstOrThrow({
    where: { organizationId: region.organizationId, slug: "standard" },
  });
  const table = await prisma.pricingTable.findFirstOrThrow({
    where: { organizationId: region.organizationId, regionId: null, status: "PUBLISHED" },
  });
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const customer = await prisma.customer.create({
    data: {
      organizationId: region.organizationId,
      firstName: "Fixture",
      lastName: "Test",
      email: `fixture-${stamp}@example.com`,
      phone: "+14165550998",
    },
  });
  const address = await prisma.address.create({
    data: {
      customerId: customer.id,
      regionId: region.id,
      line1: "9 Fixture St",
      city: "Toronto",
      province: "ON",
      postalCode: "M5V 2T6",
      fsa: "M5V",
    },
  });
  const window = region.windows[0];
  const date = todayIn(region.timezone, new Date(Date.now() + opts.startInHours * 3600_000));
  const frequency = opts.frequency ?? "ONE_TIME";
  const bedrooms = opts.bedrooms ?? 2;
  const input = {
    regionId: region.id,
    province: "ON",
    serviceSlug: "standard",
    pricingModel: "FLAT",
    bedrooms,
    bathrooms: 1,
    extras: [],
    frequency,
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
      bookingNumber: `MS-F${stamp.slice(-6)}`,
      frequency,
      anchorDate: localDateToDateColumn(date),
      weekday: weekdayOf(date),
      windowId: window.id,
      bedrooms,
      bathrooms: "1",
      generatedThrough: localDateToDateColumn(date),
    },
  });
  const quote = await prisma.priceQuote.create({
    data: {
      bookingId: booking.id,
      regionId: region.id,
      pricingTableId: table.id,
      engineVersion: "fixture",
      inputs: input,
      lines: [
        {
          step: "BASE",
          key: "standard",
          label: "Base price",
          qty: 1,
          unitCents: 13900,
          amountCents: 13900,
        },
        {
          step: "TAX",
          key: "HST",
          label: "HST (13%)",
          qty: 1,
          unitCents: 1807,
          amountCents: 1807,
          meta: { rateBps: 1300 },
        },
      ],
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
      scheduledStartAt: zonedToInstant(date, window.startLocal, region.timezone),
      scheduledEndAt: zonedToInstant(date, window.endLocal, region.timezone),
      estimatedMinutes: 160,
      serviceId: service.id,
      addressId: address.id,
      addressSnapshot: {},
      bedrooms,
      bathrooms: "1",
      activeQuoteId: quote.id,
    },
  });
  await prisma.priceQuote.update({ where: { id: quote.id }, data: { jobId: job.id } });
  return { region, booking, job, customer, window, windows: region.windows, date };
}

export async function cleanupTestCustomer(customerId: string) {
  const jobs = await prisma.job.findMany({ where: { customerId }, select: { id: true } });
  const jobIds = jobs.map((j) => j.id);
  await prisma.cleanerEarning.deleteMany({ where: { jobId: { in: jobIds } } });
  await prisma.notification.deleteMany({
    where: { OR: [{ recipientId: customerId }, { jobId: { in: jobIds } }] },
  });
  await prisma.priceQuote.deleteMany({ where: { booking: { customerId } } });
  await prisma.booking.deleteMany({ where: { customerId } });
  await prisma.customer.delete({ where: { id: customerId } }).catch(() => {});
}
