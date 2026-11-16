import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { currency } from "@/modules/shared/country";

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
const customerOf = (c: CustomerRow) => ({
  id: c.id,
  firstName: c.firstName,
  lastName: c.lastName,
  email: c.email,
  phone: c.phone,
});

export async function bookingPayload(db: Db, bookingId: string) {
  const b = await db.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { customer: true, address: true, service: true, region: true },
  });
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
    customer: customerOf(b.customer),
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
  };
}

export async function jobPayload(db: Db, jobId: string) {
  const j = await db.job.findUniqueOrThrow({
    where: { id: jobId },
    include: {
      booking: { select: { bookingNumber: true, frequency: true } },
      customer: true,
      service: true,
      region: true,
      activeQuote: { select: { totalCents: true } },
      assignments: {
        where: { status: { in: ["OFFERED", "ACCEPTED"] } },
        include: { cleaner: { select: { id: true, firstName: true } } },
      },
    },
  });
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
    customer: customerOf(j.customer),
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
  };
}

export async function chargePayload(db: Db, chargeId: string) {
  const c = await db.charge.findUniqueOrThrow({
    where: { id: chargeId },
    include: {
      customer: true,
      job: { select: { id: true, booking: { select: { bookingNumber: true } } } },
      refunds: { where: { status: "SUCCEEDED" }, select: { amountCents: true } },
    },
  });
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
    customer: customerOf(c.customer),
    failureCode: c.failureCode,
    failureMessage: c.failureMessage,
    attemptCount: c.attemptCount,
    capturedAt: iso(c.capturedAt),
    createdAt: iso(c.createdAt),
  };
}
