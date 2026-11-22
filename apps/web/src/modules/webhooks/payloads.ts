import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { currency } from "@/modules/shared/country";

/**
 * Public JSON shapes for bookings, visits (jobs), payments and customers. Webhooks and the REST
 * API (/api/v1) both use them, so an integration sees the same object either way. Each shape
 * has an `include` for loading rows (one query for a whole list) and a `to…` mapper.
 */

/** Works inside or outside a transaction. */
export type Db = PrismaClient | Prisma.TransactionClient;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);

type CustomerRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
};
const customerRef = (c: CustomerRow) => ({
  id: c.id,
  firstName: c.firstName,
  lastName: c.lastName,
  email: c.email,
  phone: c.phone,
});

// ── Bookings ────────────────────────────────────────────────────────────────

export const bookingInclude = {
  customer: true,
  address: true,
  service: true,
  region: true,
} satisfies Prisma.BookingInclude;

export function toBooking(b: Prisma.BookingGetPayload<{ include: typeof bookingInclude }>) {
  return {
    id: b.id,
    bookingNumber: b.bookingNumber,
    status: b.status,
    source: b.source,
    frequency: b.frequency,
    startDate: dateOnly(b.anchorDate),
    endsOn: b.endsOn ? dateOnly(b.endsOn) : null,
    service: { slug: b.service.slug, name: b.service.name },
    region: { slug: b.region.slug, name: b.region.name },
    customer: customerRef(b.customer),
    address: {
      line1: b.address.line1,
      line2: b.address.line2,
      city: b.address.city,
      province: b.address.province,
      postalCode: b.address.postalCode,
    },
    bedrooms: b.bedrooms,
    bathrooms: Number(b.bathrooms),
    customerNotes: b.customerNotes,
    cancellationReason: b.cancellationReason,
    cancelledAt: iso(b.cancelledAt),
    createdAt: iso(b.createdAt),
    updatedAt: iso(b.updatedAt),
  };
}

export async function bookingPayload(db: Db, bookingId: string) {
  return toBooking(
    await db.booking.findUniqueOrThrow({ where: { id: bookingId }, include: bookingInclude }),
  );
}

// ── Visits (jobs) ───────────────────────────────────────────────────────────

export const jobInclude = {
  booking: { select: { bookingNumber: true, frequency: true } },
  customer: true,
  service: true,
  region: true,
  activeQuote: { select: { totalCents: true } },
  assignments: {
    where: { status: { in: ["OFFERED", "ACCEPTED"] } },
    include: { cleaner: { select: { id: true, firstName: true } } },
  },
} satisfies Prisma.JobInclude;

export function toJob(j: Prisma.JobGetPayload<{ include: typeof jobInclude }>) {
  return {
    id: j.id,
    bookingId: j.bookingId,
    bookingNumber: j.booking.bookingNumber,
    frequency: j.booking.frequency,
    status: j.status,
    scheduledDate: dateOnly(j.scheduledDate),
    window: { start: j.windowStartLocal, end: j.windowEndLocal },
    timezone: j.timezone,
    scheduledStartAt: iso(j.scheduledStartAt),
    scheduledEndAt: iso(j.scheduledEndAt),
    service: { slug: j.service.slug, name: j.service.name },
    region: { slug: j.region.slug, name: j.region.name },
    customer: customerRef(j.customer),
    address: j.addressSnapshot,
    cleaners: j.assignments.map((a) => ({
      id: a.cleaner.id,
      firstName: a.cleaner.firstName,
      status: a.status,
    })),
    totalCents: j.activeQuote?.totalCents ?? null,
    tipCents: j.tipCents,
    currency,
    paymentStatus: j.paymentStatus,
    startedAt: iso(j.actualStartAt),
    completedAt: iso(j.completedAt),
    cancelledAt: iso(j.cancelledAt),
    cancellationType: j.cancellationType,
    cancellationReason: j.cancellationReason,
    createdAt: iso(j.createdAt),
    updatedAt: iso(j.updatedAt),
  };
}

export async function jobPayload(db: Db, jobId: string) {
  return toJob(await db.job.findUniqueOrThrow({ where: { id: jobId }, include: jobInclude }));
}

// ── Payments (charges) ──────────────────────────────────────────────────────

export const chargeInclude = {
  customer: true,
  job: { select: { id: true, booking: { select: { bookingNumber: true } } } },
  refunds: { where: { status: "SUCCEEDED" }, select: { amountCents: true } },
} satisfies Prisma.ChargeInclude;

export function toPayment(c: Prisma.ChargeGetPayload<{ include: typeof chargeInclude }>) {
  return {
    id: c.id,
    type: c.type,
    status: c.status,
    amountCents: c.amountCents,
    cardCents: c.cardCents,
    giftCardCents: c.giftCardCents,
    refundedCents: c.refunds.reduce((s, r) => s + r.amountCents, 0),
    currency: c.currency,
    jobId: c.job?.id ?? null,
    bookingNumber: c.job?.booking.bookingNumber ?? null,
    customer: customerRef(c.customer),
    failureCode: c.failureCode,
    failureMessage: c.failureMessage,
    attemptCount: c.attemptCount,
    capturedAt: iso(c.capturedAt),
    createdAt: iso(c.createdAt),
    updatedAt: iso(c.updatedAt),
  };
}

export async function chargePayload(db: Db, chargeId: string) {
  return toPayment(
    await db.charge.findUniqueOrThrow({ where: { id: chargeId }, include: chargeInclude }),
  );
}

// ── Customers ───────────────────────────────────────────────────────────────

export const customerInclude = {
  addresses: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.CustomerInclude;

export function toCustomer(c: Prisma.CustomerGetPayload<{ include: typeof customerInclude }>) {
  return {
    ...customerRef(c),
    marketingOptIn: c.marketingOptIn,
    smsOptOut: c.smsOptOut,
    source: c.source,
    tags: c.tags,
    anonymized: !!c.anonymizedAt,
    addresses: c.addresses.map((a) => ({
      id: a.id,
      line1: a.line1,
      line2: a.line2,
      city: a.city,
      province: a.province,
      postalCode: a.postalCode,
    })),
    createdAt: iso(c.createdAt),
    updatedAt: iso(c.updatedAt),
  };
}
