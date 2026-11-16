/**
 * Contract for the cleaner mobile API (`/api/mobile/v1`). The server validates requests with these
 * schemas and builds responses of these types; the Expo app imports the same file.
 *
 * Auth: `POST auth/otp/request` then `POST auth/otp/verify` returns a token pair. Send
 * `Authorization: Bearer <accessToken>` on every other call. When a call answers 401
 * `UNAUTHORIZED`, call `POST auth/refresh` once (never concurrently: a refresh token is single-use
 * and replaying an old one ends the session) and retry.
 */
import { z } from "zod";

export const MOBILE_API_BASE = "/api/mobile/v1";

// ── Envelope ────────────────────────────────────────────────────────────────

export type ApiErrorCode =
  | "UNAUTHORIZED" // missing/expired access token: refresh and retry
  | "SESSION_ENDED" // refresh token invalid, reused, expired or revoked: sign in again
  | "INACTIVE" // the cleaner profile is suspended or inactive
  | "NOT_FOUND"
  | "CONFLICT" // already done (answered, checked in, ...)
  | "PRECONDITION" // wrong step (accept first, check in first, required items open)
  | "INVALID" // bad input; see issues
  | "RATE_LIMITED"
  | "INTERNAL";

export type ApiError = {
  code: ApiErrorCode;
  message: string;
  issues?: { path: (string | number)[]; message: string }[];
};

export type ApiResponse<T> =
  { ok: true; data: T; message?: string; warnings?: string[] } | { ok: false; error: ApiError };

// ── Shared field schemas ────────────────────────────────────────────────────

export const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD dates.");

export const positionSchema = z
  .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
  .nullable();
export type Position = z.infer<typeof positionSchema>;

export const photoKindSchema = z.enum(["BEFORE", "AFTER", "ISSUE"]);
export type PhotoKind = z.infer<typeof photoKindSchema>;

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM times.");
export const availabilityRowSchema = z
  .object({ weekday: z.number().int().min(0).max(6), startLocal: hhmm, endLocal: hhmm })
  .refine((r) => r.startLocal < r.endLocal, "Each start time must be before its end time.");
export const availabilitySchema = z.array(availabilityRowSchema).max(28);
export type AvailabilityRow = z.infer<typeof availabilityRowSchema>;

export const timeOffSchema = z
  .object({
    startsAt: localDateSchema,
    endsAt: localDateSchema,
    reason: z.string().trim().max(300).optional().default(""),
  })
  .refine((t) => t.startsAt <= t.endsAt, "Check the dates.");

// ── Requests ────────────────────────────────────────────────────────────────

export const deviceSchema = z.object({
  name: z.string().trim().min(1).max(80).default("Phone"),
  platform: z.enum(["ios", "android", "web", "other"]).default("other"),
  appVersion: z.string().trim().max(40).optional(),
});
export type DeviceInfo = z.infer<typeof deviceSchema>;

export const otpRequestBody = z.object({ phone: z.string().trim().min(7).max(20) });
export const otpVerifyBody = z.object({
  phone: z.string().trim().min(7).max(20),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code."),
  device: deviceSchema.default({ name: "Phone", platform: "other" }),
});
export const refreshBody = z.object({ refreshToken: z.string().min(20).max(200) });

export const jobsQuery = z.object({
  from: localDateSchema.optional(),
  to: localDateSchema.optional(),
});
export const respondBody = z.object({ accept: z.boolean() });
export const positionBody = z.object({ position: positionSchema.default(null) });
export const checklistBody = z.object({ done: z.boolean() });
export const availabilityBody = z.object({ rows: availabilitySchema });
export const timeOffBody = timeOffSchema;
/** Expo push token from `getExpoPushTokenAsync()`. */
export const expoPushTokenSchema = z
  .string()
  .trim()
  .regex(/^Expo(nent)?PushToken\[[^\]]+\]$/, "Not an Expo push token.");
export const registerDeviceBody = z.object({
  expoPushToken: expoPushTokenSchema,
  platform: z.enum(["ios", "android", "web", "other"]).default("other"),
});
export const unregisterDeviceBody = z.object({ expoPushToken: expoPushTokenSchema });

/**
 * What a push carries in `data`. `jobId` means "open this job"; `kind` is one of
 * offer | assigned | rescheduled | reminder (with jobId) or cancelled | removed (without).
 */
export type PushData = { kind: string; jobId?: string };

/** Multipart fields for `POST jobs/:id/photos`, next to the `file` part. */
export const photoFields = z.object({
  kind: photoKindSchema,
  clientId: z.string().trim().min(8).max(64).optional(),
});

// ── Responses ───────────────────────────────────────────────────────────────

export type TokenPair = {
  accessToken: string;
  accessExpiresAt: string; // ISO
  refreshToken: string;
  refreshExpiresAt: string; // ISO
};

export type OtpRequestResult = { channel: "sms" | "email"; maskedTo: string };

export type Me = {
  cleanerId: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  timezone: string;
  homeRegion: string;
  currency: string;
  locale: string;
};

export type Permissions = {
  isOpen: boolean;
  canRespond: boolean;
  canGoEnRoute: boolean;
  canCheckIn: boolean;
  canCheckOut: boolean;
  canEditChecklist: boolean;
  canAddPhotos: boolean;
  canSeeCustomer: boolean;
  canSeePhotos: boolean;
};

export type JobSummary = {
  jobId: string;
  assignmentStatus: "OFFERED" | "ACCEPTED";
  role: "LEAD" | "MEMBER";
  jobStatus: string;
  scheduledDate: string; // YYYY-MM-DD in the job's timezone
  windowStartLocal: string; // HH:MM
  windowEndLocal: string;
  startsAt: string; // ISO
  timezone: string;
  estimatedMinutes: number;
  serviceName: string;
  bookingNumber: string;
  area: { line1: string; city: string };
  teammates: string[]; // first names of the other accepted cleaners
};

export type JobDetail = JobSummary & {
  address: {
    line1: string;
    line2: string | null;
    city: string;
    postalCode: string;
    entryInstructions: string | null;
    parkingInstructions: string | null;
    lat: number | null;
    lng: number | null;
  };
  customer: { firstName: string; lastName: string; phone: string | null } | null; // after accepting
  notes: { customer: string | null; dispatch: string | null };
  home: {
    bedrooms: number;
    bathrooms: string;
    sqft: number | null;
    extras: { slug: string; qty: number }[];
    firstCleanUpgrade: boolean;
  };
  checklist: {
    id: string;
    section: string;
    label: string;
    done: boolean;
    requiresPhoto: boolean;
  }[];
  photos: { id: string; kind: string; url: string; takenAt: string }[];
  checkInAt: string | null;
  checkOutAt: string | null;
  completedAt: string | null;
  can: Permissions;
};

export type CheckOutResult = { completed: boolean };
export type PhotoResult = { id: string; url: string };

export type Earnings = {
  pay: { type: string; rateCents: number | null; percentBps: number | null };
  weekCents: number;
  last30Cents: number;
  items: {
    id: string;
    jobId: string;
    scheduledDate: string;
    serviceName: string;
    customer: string; // "Ana K."
    bookingNumber: string;
    basis: string;
    baseCents: number;
    tipCents: number;
    totalCents: number;
    status: string;
  }[];
};

export type Availability = {
  timezone: string;
  rows: AvailabilityRow[];
  timeOff: {
    id: string;
    startsAt: string;
    endsAt: string;
    status: string;
    reason: string | null;
  }[];
};
