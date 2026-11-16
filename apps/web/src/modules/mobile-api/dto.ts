/**
 * Database rows → mobile API shapes. Fields are picked explicitly so internal data (customer
 * email, pricing, other cleaners' details) never leaks into the app.
 */
import type { Availability, Earnings, JobDetail, JobSummary, Me } from "@msb/shared/mobile-api";
import type {
  getAvailability,
  getEarnings,
  getJobDetail,
  listJobs,
} from "@/modules/cleaner/service";
import { dateColumnToLocalDate } from "@/modules/shared/dates";

type ListedAssignment = Awaited<ReturnType<typeof listJobs>>[number];
type Detail = NonNullable<Awaited<ReturnType<typeof getJobDetail>>>;

type AddressSnapshot = {
  line1?: string;
  line2?: string | null;
  city?: string;
  postalCode?: string;
  entryInstructions?: string | null;
  parkingInstructions?: string | null;
};

const iso = (d: Date | null) => (d ? d.toISOString() : null);

type SummarySource = {
  status: string;
  role: string;
  cleanerId: string;
  job: {
    id: string;
    status: string;
    scheduledDate: Date;
    windowStartLocal: string;
    windowEndLocal: string;
    scheduledStartAt: Date;
    timezone: string;
    estimatedMinutes: number;
    addressSnapshot: unknown;
    service: { name: string };
    booking: { bookingNumber: string };
    assignments: { cleanerId: string; cleaner: { firstName: string } }[];
  };
};

function summary(a: SummarySource): JobSummary {
  const addr = (a.job.addressSnapshot ?? {}) as AddressSnapshot;
  return {
    jobId: a.job.id,
    assignmentStatus: a.status as JobSummary["assignmentStatus"],
    role: a.role as JobSummary["role"],
    jobStatus: a.job.status,
    scheduledDate: dateColumnToLocalDate(a.job.scheduledDate),
    windowStartLocal: a.job.windowStartLocal,
    windowEndLocal: a.job.windowEndLocal,
    startsAt: a.job.scheduledStartAt.toISOString(),
    timezone: a.job.timezone,
    estimatedMinutes: a.job.estimatedMinutes,
    serviceName: a.job.service.name,
    bookingNumber: a.job.booking.bookingNumber,
    area: { line1: addr.line1 ?? "", city: addr.city ?? "" },
    teammates: a.job.assignments
      .filter((x) => x.cleanerId !== a.cleanerId)
      .map((x) => x.cleaner.firstName),
  };
}

export const toJobSummary = (a: ListedAssignment): JobSummary => summary(a);

export function toJobDetail(d: Detail): JobDetail {
  const { assignment: a, job, can } = d;
  const addr = (job.addressSnapshot ?? {}) as AddressSnapshot;
  return {
    ...summary({ ...a, job }),
    address: {
      line1: addr.line1 ?? "",
      line2: addr.line2 || null,
      city: addr.city ?? "",
      postalCode: addr.postalCode ?? "",
      entryInstructions: addr.entryInstructions || null,
      parkingInstructions: addr.parkingInstructions || null,
      lat: job.address?.lat ?? null,
      lng: job.address?.lng ?? null,
    },
    customer: can.canSeeCustomer
      ? {
          firstName: job.customer.firstName,
          lastName: job.customer.lastName,
          phone: job.customer.phone,
        }
      : null,
    notes: { customer: job.customerNotes || null, dispatch: job.internalNotes || null },
    home: {
      bedrooms: job.bedrooms,
      bathrooms: job.bathrooms.toString(),
      sqft: job.sqft ?? null,
      extras: (job.extras ?? []) as { slug: string; qty: number }[],
      firstCleanUpgrade: job.isFirstCleanUpgrade,
    },
    checklist: job.checklist.map((i) => ({
      id: i.id,
      section: i.section,
      label: i.label,
      done: !!i.completedAt,
      requiresPhoto: i.requiresPhoto,
    })),
    photos: can.canSeePhotos
      ? job.photos.map((p) => ({
          id: p.id,
          kind: p.kind,
          url: p.url,
          takenAt: p.takenAt.toISOString(),
        }))
      : [],
    checkInAt: iso(a.checkInAt),
    checkOutAt: iso(a.checkOutAt),
    completedAt: iso(job.completedAt),
    can,
  };
}

export function toEarnings(e: Awaited<ReturnType<typeof getEarnings>>): Earnings {
  return {
    pay: {
      type: e.pay.payType,
      rateCents: e.pay.payRateCents,
      percentBps: e.pay.payPercentBps,
    },
    weekCents: e.weekCents,
    last30Cents: e.last30Cents,
    items: e.rows.map((r) => ({
      id: r.id,
      jobId: r.jobId,
      scheduledDate: dateColumnToLocalDate(r.job.scheduledDate),
      serviceName: r.job.service.name,
      customer: `${r.job.customer.firstName} ${r.job.customer.lastName.slice(0, 1)}.`,
      bookingNumber: r.job.booking.bookingNumber,
      basis: r.basis,
      baseCents: r.baseCents,
      tipCents: r.tipCents,
      totalCents: r.totalCents,
      status: r.status,
    })),
  };
}

export function toAvailability(a: Awaited<ReturnType<typeof getAvailability>>): Availability {
  return {
    timezone: a.timezone,
    rows: a.availability.map((r) => ({
      weekday: r.weekday,
      startLocal: r.startLocal,
      endLocal: r.endLocal,
    })),
    timeOff: a.timeOff.map((t) => ({
      id: t.id,
      startsAt: t.startsAt.toISOString().slice(0, 10),
      endsAt: t.endsAt.toISOString().slice(0, 10),
      status: t.status,
      reason: t.reason,
    })),
  };
}

export function toMe(
  c: {
    id: string;
    firstName: string;
    lastName: string;
    photoUrl: string | null;
    homeRegion: { name: string; timezone: string };
  },
  locale: { currency: string; locale: string },
): Me {
  return {
    cleanerId: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    photoUrl: c.photoUrl,
    timezone: c.homeRegion.timezone,
    homeRegion: c.homeRegion.name,
    currency: locale.currency,
    locale: locale.locale,
  };
}
