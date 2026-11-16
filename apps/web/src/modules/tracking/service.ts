/**
 * Live "on the way" tracking. Starts when a cleaner taps "On my way", takes location pings from
 * the cleaner app until check-in, keeps an ETA, and serves the customer's /track/<token> view.
 *
 * Privacy: the cleaner's position is stored only between "On my way" and check-in, shown only
 * while the job is EN_ROUTE, and pings are purged after 7 days (retention task).
 */
import { randomBytes } from "node:crypto";
import type { LocationPing, LocationResult, Position } from "@msb/shared/mobile-api";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/modules/db/client";
import { emit } from "@/modules/jobs/client";
import { haversineKm, type Point } from "@/modules/shared/geo";
import { driveSeconds, staticMapUrl } from "./eta";

/** Within this distance of the home the customer gets "arriving now". */
export const ARRIVING_KM = 0.3;
/** ETA this far past the end of the arrival window counts as running late. */
export const LATE_GRACE_MS = 10 * 60_000;
/** ETA is recomputed at most this often (Mapbox calls cost money). */
export const ETA_REFRESH_MS = 60_000;
/** A position older than this isn't shown to the customer. */
export const STALE_LOCATION_MS = 10 * 60_000;
export const PING_RETENTION_DAYS = 7;

const homeOf = (job: { address: { lat: number | null; lng: number | null } | null }) =>
  job.address?.lat != null && job.address?.lng != null
    ? { lat: job.address.lat, lng: job.address.lng }
    : null;

/**
 * Called once the job is EN_ROUTE: issues the tracking link, records the starting position and
 * first ETA, and has the customer told (job/tracking event). Safe to call again.
 */
export async function startTracking(assignmentId: string, position: Position, now = new Date()) {
  const a = await prisma.assignment.findUniqueOrThrow({
    where: { id: assignmentId },
    include: { job: { include: { address: { select: { lat: true, lng: true } } } } },
  });
  const trackingToken = a.trackingToken ?? randomBytes(18).toString("base64url");
  const home = homeOf(a.job);
  const eta = position && home ? await driveSeconds(position, home) : null;
  await prisma.assignment.update({
    where: { id: a.id },
    data: {
      trackingToken,
      ...(position ? { lastLat: position.lat, lastLng: position.lng, lastLocationAt: now } : {}),
      ...(eta ? { etaAt: new Date(now.getTime() + eta.seconds * 1000), etaUpdatedAt: now } : {}),
    },
  });
  await emit("job/tracking", { assignmentId: a.id, kind: "en_route" });
  return { trackingToken };
}

/**
 * Stores a batch of pings from the cleaner app. Returns `tracking: false` once the job has moved
 * on (checked in, cancelled, reassigned) so the app stops sending.
 */
export async function recordLocations(
  assignmentId: string,
  pings: LocationPing[],
  now = new Date(),
): Promise<LocationResult> {
  const a = await prisma.assignment.findUniqueOrThrow({
    where: { id: assignmentId },
    include: { job: { include: { address: { select: { lat: true, lng: true } } } } },
  });
  if (a.status !== "ACCEPTED" || a.job.status !== "EN_ROUTE" || !a.trackingToken || a.checkInAt)
    return { tracking: false, etaAt: null };

  // Ignore clock-skewed or stale points: keep the last hour, up to 2 minutes "in the future".
  const valid = pings
    .map((p) => ({ ...p, at: new Date(p.recordedAt) }))
    .filter(
      (p) => p.at.getTime() > now.getTime() - 3600_000 && p.at.getTime() < now.getTime() + 120_000,
    )
    .sort((x, y) => x.at.getTime() - y.at.getTime());
  if (!valid.length) return { tracking: true, etaAt: a.etaAt?.toISOString() ?? null };

  await prisma.locationPing.createMany({
    data: valid.map((p) => ({
      assignmentId: a.id,
      lat: p.lat,
      lng: p.lng,
      accuracyM: p.accuracyM ?? null,
      recordedAt: p.at,
    })),
  });
  const latest = valid[valid.length - 1];
  const newer = !a.lastLocationAt || latest.at > a.lastLocationAt;
  const home = homeOf(a.job);
  let etaAt = a.etaAt;
  const data: Prisma.AssignmentUpdateInput = {};
  const events: ("arriving" | "late")[] = [];
  if (newer)
    Object.assign(data, { lastLat: latest.lat, lastLng: latest.lng, lastLocationAt: latest.at });

  if (newer && home) {
    const here: Point = { lat: latest.lat, lng: latest.lng };
    const km = haversineKm(here, home);
    if (km <= ARRIVING_KM) {
      etaAt = now;
      Object.assign(data, { etaAt, etaUpdatedAt: now });
      if (!a.arrivingNotifiedAt) {
        data.arrivingNotifiedAt = now;
        events.push("arriving");
      }
    } else if (!a.etaUpdatedAt || now.getTime() - a.etaUpdatedAt.getTime() >= ETA_REFRESH_MS) {
      const eta = await driveSeconds(here, home);
      etaAt = new Date(now.getTime() + eta.seconds * 1000);
      Object.assign(data, { etaAt, etaUpdatedAt: now });
      const late = etaAt.getTime() > a.job.scheduledEndAt.getTime() + LATE_GRACE_MS;
      if (late && !a.lateNotifiedAt) {
        data.lateNotifiedAt = now;
        events.push("late");
      }
    }
  }
  if (Object.keys(data).length) await prisma.assignment.update({ where: { id: a.id }, data });
  // After the update, so the message reads the new ETA.
  for (const kind of events) await emit("job/tracking", { assignmentId: a.id, kind });
  return { tracking: true, etaAt: etaAt?.toISOString() ?? null };
}

export type TrackingStatus = "scheduled" | "on_the_way" | "arrived" | "done" | "cancelled";

export type TrackingView = {
  status: TrackingStatus;
  cleaner: { firstName: string; photoUrl: string | null };
  window: { start: string; end: string; date: string };
  timezone: string;
  etaAt: string | null;
  cleanerLocation: (Point & { at: string }) | null;
  home: Point | null;
  mapUrl: string | null;
};

function statusOf(jobStatus: string): TrackingStatus {
  switch (jobStatus) {
    case "EN_ROUTE":
      return "on_the_way";
    case "IN_PROGRESS":
      return "arrived";
    case "COMPLETED":
      return "done";
    case "CANCELLED":
    case "SKIPPED":
    case "NO_SHOW":
      return "cancelled";
    default:
      return "scheduled";
  }
}

/** The customer's view for a tracking link, or null for an unknown token. */
export async function getTrackingView(
  token: string,
  now = new Date(),
): Promise<TrackingView | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const a = await prisma.assignment.findUnique({
    where: { trackingToken: token },
    include: {
      cleaner: { select: { firstName: true, photoUrl: true } },
      job: { include: { address: { select: { lat: true, lng: true } } } },
    },
  });
  if (!a) return null;
  // A cleaner taken off the job no longer represents it: show it as not on the way.
  const status = a.status === "ACCEPTED" ? statusOf(a.job.status) : "scheduled";
  const fresh =
    status === "on_the_way" &&
    a.lastLat != null &&
    a.lastLng != null &&
    !!a.lastLocationAt &&
    now.getTime() - a.lastLocationAt.getTime() <= STALE_LOCATION_MS;
  const cleanerLocation = fresh
    ? { lat: a.lastLat!, lng: a.lastLng!, at: a.lastLocationAt!.toISOString() }
    : null;
  const home = homeOf(a.job);
  return {
    status,
    cleaner: { firstName: a.cleaner.firstName, photoUrl: a.cleaner.photoUrl },
    window: {
      start: a.job.windowStartLocal,
      end: a.job.windowEndLocal,
      date: a.job.scheduledDate.toISOString().slice(0, 10),
    },
    timezone: a.job.timezone,
    etaAt: status === "on_the_way" ? (a.etaAt?.toISOString() ?? null) : null,
    cleanerLocation,
    home: status === "on_the_way" || status === "scheduled" ? home : null,
    mapUrl: status === "on_the_way" && home ? staticMapUrl(cleanerLocation, home) : null,
  };
}

/** Retention: drops pings older than 7 days and clears stale last-known positions. */
export async function purgeLocations(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - PING_RETENTION_DAYS * 86_400_000);
  const { count } = await prisma.locationPing.deleteMany({ where: { recordedAt: { lt: cutoff } } });
  await prisma.assignment.updateMany({
    where: { lastLocationAt: { lt: cutoff } },
    data: { lastLat: null, lastLng: null, lastLocationAt: null },
  });
  return count;
}
