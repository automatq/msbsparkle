import { z } from "zod";
import { BookingStatus, ChargeStatus, JobStatus } from "@/generated/prisma/enums";
import { prisma } from "@/modules/db/client";
import { localDateToDateColumn } from "@/modules/shared/dates";
import {
  bookingInclude,
  chargeInclude,
  customerInclude,
  jobInclude,
  toBooking,
  toCustomer,
  toJob,
  toPayment,
} from "@/modules/webhooks/payloads";
import {
  ApiNotFound,
  cursorArgs,
  isoDate,
  isoDateTime,
  listQuery,
  page,
  queryObject,
} from "./http";

/** Read-only queries behind /api/v1. Every query is scoped to the API key's organization. */

const since = (s: string | undefined) => (s ? { gte: new Date(s) } : undefined);
const newestFirst = [{ createdAt: "desc" as const }, { id: "desc" as const }];

// ── Bookings ────────────────────────────────────────────────────────────────

const bookingsQuery = listQuery.extend({
  status: z.enum(Object.values(BookingStatus) as [string, ...string[]]).optional(),
  customer_id: z.string().max(64).optional(),
  created_since: isoDateTime.optional(),
  updated_since: isoDateTime.optional(),
});

export async function listBookings(orgId: string, q: URLSearchParams) {
  const p = bookingsQuery.parse(queryObject(q));
  const rows = await prisma.booking.findMany({
    where: {
      organizationId: orgId,
      status: p.status as BookingStatus | undefined,
      customerId: p.customer_id,
      createdAt: since(p.created_since),
      updatedAt: since(p.updated_since),
    },
    include: bookingInclude,
    orderBy: newestFirst,
    ...cursorArgs(p.cursor, p.limit),
  });
  return page(rows, p.limit, toBooking);
}

/** By id or booking number. */
export async function getBooking(orgId: string, idOrNumber: string) {
  const row = await prisma.booking.findFirst({
    where: {
      organizationId: orgId,
      OR: [{ id: idOrNumber }, { bookingNumber: idOrNumber.toUpperCase() }],
    },
    include: bookingInclude,
  });
  if (!row) throw new ApiNotFound("No booking with that id or number.");
  return { data: toBooking(row) };
}

// ── Visits (jobs) ───────────────────────────────────────────────────────────

const jobsQuery = listQuery.extend({
  from: isoDate.optional(),
  to: isoDate.optional(),
  status: z.enum(Object.values(JobStatus) as [string, ...string[]]).optional(),
  booking_id: z.string().max(64).optional(),
  customer_id: z.string().max(64).optional(),
  updated_since: isoDateTime.optional(),
});

/** Ordered by scheduled start, soonest first. */
export async function listJobs(orgId: string, q: URLSearchParams) {
  const p = jobsQuery.parse(queryObject(q));
  const rows = await prisma.job.findMany({
    where: {
      organizationId: orgId,
      status: p.status as JobStatus | undefined,
      bookingId: p.booking_id,
      customerId: p.customer_id,
      updatedAt: since(p.updated_since),
      scheduledDate:
        p.from || p.to
          ? {
              ...(p.from ? { gte: localDateToDateColumn(p.from) } : {}),
              ...(p.to ? { lte: localDateToDateColumn(p.to) } : {}),
            }
          : undefined,
    },
    include: jobInclude,
    orderBy: [{ scheduledStartAt: "asc" }, { id: "asc" }],
    ...cursorArgs(p.cursor, p.limit),
  });
  return page(rows, p.limit, toJob);
}

export async function getJob(orgId: string, id: string) {
  const row = await prisma.job.findFirst({
    where: { organizationId: orgId, id },
    include: jobInclude,
  });
  if (!row) throw new ApiNotFound("No visit with that id.");
  return { data: toJob(row) };
}

// ── Customers ───────────────────────────────────────────────────────────────

const customersQuery = listQuery.extend({
  email: z.string().trim().max(200).optional(),
  updated_since: isoDateTime.optional(),
});

export async function listCustomers(orgId: string, q: URLSearchParams) {
  const p = customersQuery.parse(queryObject(q));
  const rows = await prisma.customer.findMany({
    where: {
      organizationId: orgId,
      email: p.email ? { equals: p.email, mode: "insensitive" } : undefined,
      updatedAt: since(p.updated_since),
    },
    include: customerInclude,
    orderBy: newestFirst,
    ...cursorArgs(p.cursor, p.limit),
  });
  return page(rows, p.limit, toCustomer);
}

export async function getCustomer(orgId: string, id: string) {
  const row = await prisma.customer.findFirst({
    where: { organizationId: orgId, id },
    include: customerInclude,
  });
  if (!row) throw new ApiNotFound("No customer with that id.");
  return { data: toCustomer(row) };
}

// ── Payments ────────────────────────────────────────────────────────────────

const paymentsQuery = listQuery.extend({
  status: z.enum(Object.values(ChargeStatus) as [string, ...string[]]).optional(),
  job_id: z.string().max(64).optional(),
  customer_id: z.string().max(64).optional(),
  created_since: isoDateTime.optional(),
});

export async function listPayments(orgId: string, q: URLSearchParams) {
  const p = paymentsQuery.parse(queryObject(q));
  const rows = await prisma.charge.findMany({
    where: {
      organizationId: orgId,
      status: p.status as ChargeStatus | undefined,
      jobId: p.job_id,
      customerId: p.customer_id,
      createdAt: since(p.created_since),
    },
    include: chargeInclude,
    orderBy: newestFirst,
    ...cursorArgs(p.cursor, p.limit),
  });
  return page(rows, p.limit, toPayment);
}

export async function getPayment(orgId: string, id: string) {
  const row = await prisma.charge.findFirst({
    where: { organizationId: orgId, id },
    include: chargeInclude,
  });
  if (!row) throw new ApiNotFound("No payment with that id.");
  return { data: toPayment(row) };
}

// ── Key info ────────────────────────────────────────────────────────────────

export async function describeKey(orgId: string, keyId: string) {
  const [org, key] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { name: true } }),
    prisma.apiKey.findUniqueOrThrow({
      where: { id: keyId },
      select: { name: true, prefix: true, createdAt: true },
    }),
  ]);
  return {
    data: {
      organization: { name: org.name },
      key: { name: key.name, prefix: key.prefix, createdAt: key.createdAt.toISOString() },
    },
  };
}
