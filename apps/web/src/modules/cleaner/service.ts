/**
 * Cleaner job rules, shared by the web portal (Server Actions) and the mobile API.
 *
 * Every function takes a resolved {@link CleanerActor} and enforces authorization itself: the UI
 * hiding a button is never the check. Results are plain data with a stable error `code` so route
 * handlers can map them to HTTP statuses. No `next/*` imports here; callers revalidate.
 */
import { z } from "zod";
import { prisma } from "@/modules/db/client";
import type { Prisma } from "@/generated/prisma/client";
import { createEarningForAssignment } from "@/modules/cleaner/earnings";
import { emit } from "@/modules/jobs/client";
import { transitionJob, type Actor } from "@/modules/jobs/state-machine";
import { addLocalDays, dateColumnToLocalDate, todayIn } from "@/modules/shared/dates";
import { putObject } from "@/modules/storage";
import { sniffImageType } from "@/modules/storage/image-type";
import { isClosed, permissionsFor } from "./permissions";

export { permissionsFor, type CleanerPermissions } from "./permissions";

// ── Types ───────────────────────────────────────────────────────────────────

export type CleanerActor = {
  cleanerId: string;
  userId: string;
  orgId: string;
  firstName: string;
  timezone: string;
};

export type CleanerErrorCode =
  | "NOT_FOUND" // no such job for this cleaner (also used for jobs that belong to someone else)
  | "CONFLICT" // already done / already answered
  | "PRECONDITION" // wrong step (accept first, check in first, required items open)
  | "INVALID" // bad input
  | "INACTIVE"; // cleaner profile is not active

export type CleanerResult<T = null> =
  | { ok: true; data: T; message?: string; warnings?: string[] }
  | { ok: false; code: CleanerErrorCode; message: string };

class CleanerError extends Error {
  constructor(
    readonly code: CleanerErrorCode,
    message: string,
  ) {
    super(message);
  }
}

async function run<T>(fn: () => Promise<CleanerResult<T>>): Promise<CleanerResult<T>> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof CleanerError) return { ok: false, code: e.code, message: e.message };
    if (e instanceof z.ZodError)
      return { ok: false, code: "INVALID", message: e.issues[0]?.message ?? "Invalid input" };
    throw e;
  }
}

const ok = <T>(data: T, message?: string, warnings?: string[]): CleanerResult<T> => ({
  ok: true,
  data,
  ...(message ? { message } : {}),
  ...(warnings?.length ? { warnings } : {}),
});

/** Cleaners who can sign in and work. Suspended or inactive cleaners are refused everywhere. */
const WORKING_STATUSES = ["ONBOARDING", "ACTIVE"] as const;

// ── Actor ───────────────────────────────────────────────────────────────────

/** The cleaner behind a login, or null when there is none or it isn't allowed to work. */
export async function resolveCleanerActor(userId: string): Promise<CleanerActor | null> {
  const cleaner = await prisma.cleaner.findFirst({
    where: { userId, status: { in: [...WORKING_STATUSES] } },
    include: { homeRegion: { select: { timezone: true } } },
  });
  if (!cleaner) return null;
  return {
    cleanerId: cleaner.id,
    userId,
    orgId: cleaner.organizationId,
    firstName: cleaner.firstName,
    timezone: cleaner.homeRegion.timezone,
  };
}

const jobActor = (actor: CleanerActor): Actor => ({ type: "CLEANER", id: actor.cleanerId });

// ── Assignment lookup and permissions ───────────────────────────────────────

async function loadAssignment(actor: CleanerActor, jobId: string) {
  const a = await prisma.assignment.findUnique({
    where: { jobId_cleanerId: { jobId, cleanerId: actor.cleanerId } },
    include: { job: { include: { address: true } } },
  });
  if (!a || a.job.organizationId !== actor.orgId || !["OFFERED", "ACCEPTED"].includes(a.status))
    throw new CleanerError("NOT_FOUND", "This job is not assigned to you.");
  return a;
}

function ensure(allowed: boolean, code: CleanerErrorCode, message: string): asserts allowed {
  if (!allowed) throw new CleanerError(code, message);
}

/** Copies the service's checklist template onto the job the first time it is needed. */
async function ensureChecklist(jobId: string) {
  const count = await prisma.jobChecklistItem.count({ where: { jobId } });
  if (count) return;
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: {
      service: {
        include: { checklistTemplate: { include: { items: { orderBy: { sortOrder: "asc" } } } } },
      },
    },
  });
  const items = job.service.checklistTemplate?.items ?? [];
  if (!items.length) return;
  await prisma.jobChecklistItem.createMany({
    data: items.map((i) => ({
      jobId,
      section: i.section,
      label: i.label,
      sortOrder: i.sortOrder,
      requiresPhoto: i.requiresPhoto,
    })),
  });
}

// ── Inputs ──────────────────────────────────────────────────────────────────

export const positionSchema = z
  .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
  .nullable();
export type Position = z.infer<typeof positionSchema>;

export const photoKindSchema = z.enum(["BEFORE", "AFTER", "ISSUE"]);
export type PhotoKindInput = z.infer<typeof photoKindSchema>;

export const availabilitySchema = z
  .array(
    z
      .object({
        weekday: z.number().int().min(0).max(6),
        startLocal: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM times."),
        endLocal: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM times."),
      })
      .refine((r) => r.startLocal < r.endLocal, "Each start time must be before its end time."),
  )
  .max(28);

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Check the dates.");
export const timeOffSchema = z
  .object({
    startsAt: localDate,
    endsAt: localDate,
    reason: z.string().trim().max(300).optional().default(""),
  })
  .refine((t) => t.startsAt <= t.endsAt, "Check the dates.");

/** Matches serverActions.bodySizeLimit in next.config.ts, minus multipart overhead. */
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024 - 64 * 1024;

/** Geofence radius for the check-in warning. Advisory: check-in is never blocked. */
const GEOFENCE_KM = 0.3;

// ── Commands ────────────────────────────────────────────────────────────────

export function respondToOffer(actor: CleanerActor, jobId: string, accept: boolean) {
  return run(async () => {
    const a = await loadAssignment(actor, jobId);
    ensure(a.status === "OFFERED", "CONFLICT", "This offer was already answered.");
    ensure(!isClosed(a.job.status), "CONFLICT", "This job is no longer open.");
    await prisma.$transaction(async (tx) => {
      // Conditional update: two taps (or two devices) can't both answer the same offer.
      const updated = await tx.assignment.updateMany({
        where: { id: a.id, status: "OFFERED" },
        data: { status: accept ? "ACCEPTED" : "DECLINED", respondedAt: new Date() },
      });
      if (updated.count === 0)
        throw new CleanerError("CONFLICT", "This offer was already answered.");
      await tx.jobEvent.create({
        data: {
          jobId,
          type: accept ? "ASSIGNED" : "UNASSIGNED",
          actorType: "CLEANER",
          actorId: actor.cleanerId,
          data: { cleanerId: actor.cleanerId, status: accept ? "ACCEPTED" : "DECLINED" },
        },
      });
      if (accept && a.job.status === "CONFIRMED")
        await transitionJob(tx, jobId, "ASSIGNED", jobActor(actor));
    });
    if (accept) await ensureChecklist(jobId);
    return ok(null, accept ? "Job accepted" : "Offer declined");
  });
}

export function goEnRoute(actor: CleanerActor, jobId: string) {
  return run(async () => {
    const a = await loadAssignment(actor, jobId);
    const can = permissionsFor(a);
    ensure(a.status === "ACCEPTED", "PRECONDITION", "Accept the job first.");
    ensure(can.canGoEnRoute, "CONFLICT", "This job can't be marked on the way now.");
    await prisma.$transaction((tx) =>
      transitionJob(tx, jobId, "EN_ROUTE", jobActor(actor), { cleanerId: actor.cleanerId }),
    );
    return ok(null, "Marked as on your way");
  });
}

export function checkIn(actor: CleanerActor, jobId: string, position: Position) {
  return run(async () => {
    const pos = positionSchema.parse(position);
    const a = await loadAssignment(actor, jobId);
    ensure(a.status === "ACCEPTED", "PRECONDITION", "Accept the job first.");
    ensure(!a.checkInAt, "CONFLICT", "Already checked in.");
    ensure(!isClosed(a.job.status), "CONFLICT", "This job is no longer open.");
    const warnings: string[] = [];
    if (pos && a.job.address.lat != null && a.job.address.lng != null) {
      const km = haversineKm(pos, { lat: a.job.address.lat, lng: a.job.address.lng });
      if (km > GEOFENCE_KM) warnings.push(`You appear to be ${km.toFixed(1)} km from the address.`);
    }
    await prisma.$transaction(async (tx) => {
      const updated = await tx.assignment.updateMany({
        where: { id: a.id, checkInAt: null },
        data: { checkInAt: new Date(), checkInLat: pos?.lat ?? null, checkInLng: pos?.lng ?? null },
      });
      if (updated.count === 0) throw new CleanerError("CONFLICT", "Already checked in.");
      if (a.job.status === "ASSIGNED" || a.job.status === "EN_ROUTE")
        await transitionJob(tx, jobId, "IN_PROGRESS", jobActor(actor), {
          cleanerId: actor.cleanerId,
        });
      if (warnings.length)
        await tx.jobEvent.create({
          data: {
            jobId,
            type: "GEOFENCE_WARNING",
            actorType: "CLEANER",
            actorId: actor.cleanerId,
            data: { warnings, pos } as Prisma.InputJsonValue,
          },
        });
    });
    await ensureChecklist(jobId);
    return ok(null, "Checked in", warnings);
  });
}

export function setChecklistItem(
  actor: CleanerActor,
  jobId: string,
  itemId: string,
  done: boolean,
) {
  return run(async () => {
    const a = await loadAssignment(actor, jobId);
    const can = permissionsFor(a);
    ensure(a.status === "ACCEPTED", "PRECONDITION", "Accept the job first.");
    ensure(!!a.checkInAt, "PRECONDITION", "Check in first.");
    ensure(can.canEditChecklist, "CONFLICT", "The checklist can't be changed now.");
    const updated = await prisma.jobChecklistItem.updateMany({
      where: { id: itemId, jobId },
      data: {
        completedAt: done ? new Date() : null,
        completedByCleanerId: done ? actor.cleanerId : null,
      },
    });
    ensure(updated.count === 1, "NOT_FOUND", "Checklist item not found.");
    await prisma.jobEvent.create({
      data: {
        jobId,
        type: "CHECKLIST",
        actorType: "CLEANER",
        actorId: actor.cleanerId,
        data: { itemId, done },
      },
    });
    return ok(null);
  });
}

export type PhotoUpload = {
  kind: PhotoKindInput;
  bytes: Buffer;
  filename?: string | null;
  /** Client-generated id. Re-sending the same id returns the photo already stored. */
  clientId?: string | null;
};

export function addPhoto(actor: CleanerActor, jobId: string, upload: PhotoUpload) {
  return run(async () => {
    const kind = photoKindSchema.parse(upload.kind);
    const clientId = z.string().trim().min(8).max(64).nullish().parse(upload.clientId) ?? null;
    const a = await loadAssignment(actor, jobId);
    ensure(a.status === "ACCEPTED", "PRECONDITION", "Accept the job first.");
    ensure(permissionsFor(a).canAddPhotos, "CONFLICT", "Photos can't be added now.");
    if (clientId) {
      const existing = await prisma.jobPhoto.findUnique({
        where: { jobId_clientId: { jobId, clientId } },
        select: { id: true, url: true, cleanerId: true },
      });
      if (existing && existing.cleanerId === actor.cleanerId)
        return ok({ id: existing.id, url: existing.url }, "Photo added");
      ensure(!existing, "CONFLICT", "Photo id already used.");
    }
    ensure(upload.bytes.length > 0, "INVALID", "Choose a photo.");
    ensure(upload.bytes.length <= MAX_PHOTO_BYTES, "INVALID", "Photo is too large (4 MB max).");
    // Trust the bytes, not the client-supplied type: only JPEG, PNG, WebP and HEIC are stored.
    const contentType = sniffImageType(upload.bytes);
    ensure(!!contentType, "INVALID", "Only JPEG, PNG, WebP or HEIC photos are allowed.");
    const { key, url } = await putObject(
      `jobs/${jobId}`,
      upload.filename || `${kind.toLowerCase()}.jpg`,
      upload.bytes,
      contentType,
    );
    const photo = await prisma.jobPhoto.create({
      data: { jobId, cleanerId: actor.cleanerId, kind, storageKey: key, url, clientId },
      select: { id: true, url: true },
    });
    await prisma.jobEvent.create({
      data: {
        jobId,
        type: "PHOTO",
        actorType: "CLEANER",
        actorId: actor.cleanerId,
        data: { kind, key },
      },
    });
    return ok(photo, "Photo added");
  });
}

/** Check-out. The lead's check-out (or the last one out) completes the job. */
export function checkOut(actor: CleanerActor, jobId: string, position: Position) {
  return run(async () => {
    const pos = positionSchema.parse(position);
    const a = await loadAssignment(actor, jobId);
    ensure(a.status === "ACCEPTED", "PRECONDITION", "Accept the job first.");
    ensure(!!a.checkInAt, "PRECONDITION", "Check in first.");
    ensure(!a.checkOutAt, "CONFLICT", "Already checked out.");
    const missing = await prisma.jobChecklistItem.count({
      where: { jobId, requiresPhoto: true, completedAt: null },
    });
    ensure(
      missing === 0,
      "PRECONDITION",
      `${missing} required checklist item${missing > 1 ? "s" : ""} still open.`,
    );
    let completed = false;
    await prisma.$transaction(async (tx) => {
      const updated = await tx.assignment.updateMany({
        where: { id: a.id, checkOutAt: null },
        data: {
          checkOutAt: new Date(),
          checkOutLat: pos?.lat ?? null,
          checkOutLng: pos?.lng ?? null,
        },
      });
      if (updated.count === 0) throw new CleanerError("CONFLICT", "Already checked out.");
      const others = await tx.assignment.count({
        where: { jobId, status: "ACCEPTED", checkOutAt: null, id: { not: a.id } },
      });
      if ((a.role === "LEAD" || others === 0) && a.job.status === "IN_PROGRESS") {
        await transitionJob(tx, jobId, "COMPLETED", jobActor(actor), {
          cleanerId: actor.cleanerId,
        });
        completed = true;
        const accepted = await tx.assignment.findMany({ where: { jobId, status: "ACCEPTED" } });
        for (const x of accepted) await createEarningForAssignment(tx, x.id);
      }
    });
    if (completed) await emit("job/completed", { jobId });
    return ok({ completed }, completed ? "Job complete. Nice work!" : "Checked out");
  });
}

export function saveAvailability(actor: CleanerActor, raw: unknown) {
  return run(async () => {
    const rows = availabilitySchema.parse(raw);
    await prisma.$transaction([
      prisma.cleanerAvailability.deleteMany({ where: { cleanerId: actor.cleanerId } }),
      prisma.cleanerAvailability.createMany({
        data: rows.map((r) => ({
          cleanerId: actor.cleanerId,
          ...r,
          effectiveFrom: new Date("2020-01-01T00:00:00Z"),
        })),
      }),
    ]);
    return ok(null, "Availability saved");
  });
}

export function requestTimeOff(actor: CleanerActor, raw: unknown) {
  return run(async () => {
    const t = timeOffSchema.parse(raw);
    const startsAt = new Date(`${t.startsAt}T00:00:00Z`);
    const endsAt = new Date(`${t.endsAt}T23:59:59Z`);
    ensure(
      !Number.isNaN(startsAt.getTime()) && !Number.isNaN(endsAt.getTime()),
      "INVALID",
      "Check the dates.",
    );
    const row = await prisma.timeOff.create({
      data: { cleanerId: actor.cleanerId, startsAt, endsAt, reason: t.reason || null },
      select: { id: true },
    });
    return ok(row, "Time off requested");
  });
}

// ── Queries ─────────────────────────────────────────────────────────────────

/** Offered and accepted jobs between two local dates (inclusive), in schedule order. */
export async function listJobs(actor: CleanerActor, from: Date, to: Date) {
  return prisma.assignment.findMany({
    where: {
      cleanerId: actor.cleanerId,
      status: { in: ["OFFERED", "ACCEPTED"] },
      job: {
        organizationId: actor.orgId,
        scheduledDate: { gte: from, lte: to },
        status: { notIn: ["CANCELLED", "SKIPPED"] },
      },
    },
    include: {
      job: {
        include: {
          customer: true,
          service: true,
          booking: true,
          region: true,
          assignments: { where: { status: "ACCEPTED" }, include: { cleaner: true } },
        },
      },
    },
    orderBy: [{ job: { scheduledDate: "asc" } }, { job: { windowStartLocal: "asc" } }],
  });
}

/** One job as the cleaner sees it, with what they may do on it. Null if it isn't theirs. */
export async function getJobDetail(actor: CleanerActor, jobId: string) {
  const a = await prisma.assignment.findUnique({
    where: { jobId_cleanerId: { jobId, cleanerId: actor.cleanerId } },
    include: {
      job: {
        include: {
          customer: true,
          service: true,
          booking: true,
          checklist: { orderBy: { sortOrder: "asc" } },
          photos: { orderBy: { takenAt: "asc" } },
          assignments: { where: { status: "ACCEPTED" }, include: { cleaner: true } },
        },
      },
    },
  });
  if (!a || a.job.organizationId !== actor.orgId || !["OFFERED", "ACCEPTED"].includes(a.status))
    return null;
  return { assignment: a, job: a.job, can: permissionsFor(a) };
}

export async function getEarnings(actor: CleanerActor, today = todayIn(actor.timezone)) {
  const cleaner = await prisma.cleaner.findUniqueOrThrow({
    where: { id: actor.cleanerId },
    select: { payType: true, payRateCents: true, payPercentBps: true },
  });
  const weekStart = addLocalDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
  const rows = await prisma.cleanerEarning.findMany({
    where: { cleanerId: actor.cleanerId },
    include: { job: { include: { customer: true, service: true, booking: true } } },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
  // Bucket by when the job was completed (earning creation), not when it was scheduled.
  const sumFrom = (from: string) =>
    rows
      .filter((e) => {
        const d = dateColumnToLocalDate(e.createdAt);
        return d >= from && d <= today;
      })
      .reduce((s, e) => s + e.totalCents, 0);
  return {
    pay: cleaner,
    weekCents: sumFrom(weekStart),
    last30Cents: sumFrom(addLocalDays(today, -30)),
    rows,
  };
}

export async function getAvailability(actor: CleanerActor) {
  const [availability, timeOff] = await Promise.all([
    prisma.cleanerAvailability.findMany({
      where: { cleanerId: actor.cleanerId },
      orderBy: { weekday: "asc" },
    }),
    prisma.timeOff.findMany({
      where: { cleanerId: actor.cleanerId, endsAt: { gte: new Date() } },
      orderBy: { startsAt: "asc" },
    }),
  ]);
  return { timezone: actor.timezone, availability, timeOff };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
