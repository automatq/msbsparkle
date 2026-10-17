import type { Prisma } from "@/generated/prisma/client";

/** Customer-safe projections for /api/v1/account/*: no internal notes, pay or cleaner contact data. */
export const visitSelect = {
  id: true,
  bookingId: true,
  sequenceNumber: true,
  status: true,
  scheduledDate: true,
  windowStartLocal: true,
  windowEndLocal: true,
  timezone: true,
  scheduledStartAt: true,
  scheduledEndAt: true,
  estimatedMinutes: true,
  bedrooms: true,
  bathrooms: true,
  extras: true,
  customerNotes: true,
  paymentStatus: true,
  tipCents: true,
  completedAt: true,
  cancelledAt: true,
  regionId: true,
  activeQuote: {
    select: { subtotalCents: true, discountCents: true, taxCents: true, totalCents: true },
  },
  review: { select: { rating: true, comment: true, createdAt: true } },
  assignments: {
    where: { status: "ACCEPTED" },
    select: { role: true, cleaner: { select: { firstName: true, photoUrl: true } } },
  },
  booking: {
    select: {
      bookingNumber: true,
      frequency: true,
      service: { select: { slug: true, name: true } },
      address: { select: { line1: true, line2: true, city: true, postalCode: true } },
    },
  },
} satisfies Prisma.JobSelect;

export const bookingSelect = {
  id: true,
  bookingNumber: true,
  status: true,
  frequency: true,
  anchorDate: true,
  pausedFrom: true,
  pausedUntil: true,
  bedrooms: true,
  bathrooms: true,
  sqft: true,
  extras: true,
  customerNotes: true,
  regionId: true,
  createdAt: true,
  service: { select: { slug: true, name: true } },
  window: { select: { id: true, label: true, startLocal: true, endLocal: true } },
  address: {
    select: {
      id: true,
      line1: true,
      line2: true,
      city: true,
      province: true,
      postalCode: true,
      entryInstructions: true,
      parkingInstructions: true,
      pets: true,
    },
  },
  paymentMethod: { select: { id: true, brand: true, last4: true, expMonth: true, expYear: true } },
} satisfies Prisma.BookingSelect;
