"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { JobStatus } from "@/generated/prisma/enums";
import { assertRegionAccess, getCtx, type Ctx } from "@/modules/auth/session";
import { cancelBooking, cancelJob, pauseBooking, resumeBooking } from "@/modules/bookings/cancel";
import { prisma } from "@/modules/db/client";
import type { Actor } from "@/modules/jobs/state-machine";
import { transitionJob } from "@/modules/jobs/state-machine";
import { emit } from "@/modules/jobs/client";
import { createEarningForAssignment } from "@/modules/cleaner/earnings";
import { anonymizeCustomer } from "@/modules/jobs/tasks/retention";
import { createServiceCharge, refundCharge, waiveJobPayment } from "@/modules/payments/charges";
import { assignCleaner, rescheduleJob, unassignCleaner } from "@/modules/scheduling/assignment";
import { autoAssignDay } from "@/modules/scheduling/dispatch";
import { loadAvailability } from "@/modules/scheduling/availability";
import { localDateToDateColumn, zonedToInstant } from "@/modules/shared/dates";

export type ActionResult =
  { ok: true; message?: string; warnings?: string[] } | { ok: false; message: string };

async function adminCtx(): Promise<Ctx> {
  return getCtx("SUPER_ADMIN", "REGION_ADMIN");
}
function actorOf(ctx: Ctx): Actor {
  return { type: "ADMIN", id: ctx.userId };
}
async function jobRegionId(jobId: string): Promise<string> {
  return (await prisma.job.findUniqueOrThrow({ where: { id: jobId }, select: { regionId: true } }))
    .regionId;
}
function fail(e: unknown): ActionResult {
  return { ok: false, message: e instanceof Error ? e.message : "Something went wrong" };
}
function revalidateJob(jobId: string) {
  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath("/admin/jobs");
  revalidatePath("/admin/calendar");
}

// ── Jobs & dispatch ────────────────────────────────────────────────────────

export async function autoAssignDayAction(regionId: string, date: string): Promise<ActionResult> {
  try {
    const ctx = await adminCtx();
    assertRegionAccess(ctx, regionId);
    const res = await autoAssignDay(regionId, date, actorOf(ctx));
    revalidatePath("/admin/calendar");
    revalidatePath("/admin/jobs");
    const msg = `Assigned ${res.assigned.length} job${res.assigned.length === 1 ? "" : "s"}${res.skipped.length ? `, ${res.skipped.length} left unassigned` : ""}.`;
    return { ok: true, message: msg, warnings: res.skipped.slice(0, 5).map((s) => s.reason) };
  } catch (e) {
    return fail(e);
  }
}

export async function assignAction(
  jobId: string,
  cleanerId: string,
  force = false,
): Promise<ActionResult> {
  try {
    const ctx = await adminCtx();
    assertRegionAccess(ctx, await jobRegionId(jobId));
    const res = await assignCleaner(jobId, cleanerId, actorOf(ctx), { force });
    revalidateJob(jobId);
    if (!res.ok) return { ok: false, message: res.message };
    return { ok: true, warnings: res.warnings };
  } catch (e) {
    return fail(e);
  }
}

export async function unassignAction(jobId: string, cleanerId: string): Promise<ActionResult> {
  try {
    const ctx = await adminCtx();
    assertRegionAccess(ctx, await jobRegionId(jobId));
    await unassignCleaner(jobId, cleanerId, actorOf(ctx));
    revalidateJob(jobId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Calendar drag: move a job from one lane to another in one call. */
export async function moveAssignmentAction(
  jobId: string,
  fromCleanerId: string | null,
  toCleanerId: string | null,
): Promise<ActionResult> {
  try {
    const ctx = await adminCtx();
    assertRegionAccess(ctx, await jobRegionId(jobId));
    const actor = actorOf(ctx);
    if (toCleanerId) {
      const res = await assignCleaner(jobId, toCleanerId, actor);
      if (!res.ok) return { ok: false, message: res.message };
      if (fromCleanerId && fromCleanerId !== toCleanerId)
        await unassignCleaner(jobId, fromCleanerId, actor);
      revalidateJob(jobId);
      return { ok: true, warnings: res.warnings };
    }
    if (fromCleanerId) await unassignCleaner(jobId, fromCleanerId, actor);
    revalidateJob(jobId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function transitionAction(
  jobId: string,
  to: JobStatus,
  note?: string,
): Promise<ActionResult> {
  try {
    const ctx = await adminCtx();
    assertRegionAccess(ctx, await jobRegionId(jobId));
    await prisma.$transaction(async (tx) => {
      await transitionJob(tx, jobId, to, actorOf(ctx), note ? { note } : {});
      if (to === "COMPLETED") {
        const accepted = await tx.assignment.findMany({ where: { jobId, status: "ACCEPTED" } });
        for (const a of accepted) await createEarningForAssignment(tx, a.id);
      }
    });
    if (to === "COMPLETED") await emit("job/completed", { jobId });
    revalidateJob(jobId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function rescheduleAction(
  jobId: string,
  scheduledDate: string,
  windowId: string,
  override = false,
): Promise<ActionResult> {
  try {
    const ctx = await adminCtx();
    assertRegionAccess(ctx, await jobRegionId(jobId));
    const res = await rescheduleJob(
      { jobId, scheduledDate, windowId, actor: actorOf(ctx), override },
      { loadAvailability, zonedToInstant, localDateToDateColumn },
    );
    revalidateJob(jobId);
    return res.ok ? { ok: true, warnings: res.warnings } : { ok: false, message: res.message };
  } catch (e) {
    return fail(e);
  }
}

export async function cancelJobAction(
  jobId: string,
  reason: string,
  waiveFee: boolean,
  skip = false,
): Promise<ActionResult> {
  try {
    const ctx = await adminCtx();
    assertRegionAccess(ctx, await jobRegionId(jobId));
    const res = await cancelJob(jobId, actorOf(ctx), { reason, waiveFee, skip });
    revalidateJob(jobId);
    return {
      ok: true,
      message: res.feeCents
        ? `Cancelled with a late fee of $${(res.feeCents / 100).toFixed(2)}.`
        : "Cancelled.",
    };
  } catch (e) {
    return fail(e);
  }
}

export async function addJobNoteAction(
  jobId: string,
  note: string,
  internal = true,
): Promise<ActionResult> {
  try {
    const ctx = await adminCtx();
    assertRegionAccess(ctx, await jobRegionId(jobId));
    const text = note.trim();
    if (!text) return { ok: false, message: "Note is empty." };
    await prisma.$transaction([
      prisma.jobEvent.create({
        data: {
          jobId,
          type: "NOTE",
          actorType: "ADMIN",
          actorId: ctx.userId,
          data: { note: text, internal },
        },
      }),
      ...(internal
        ? [prisma.job.update({ where: { id: jobId }, data: { internalNotes: text } })]
        : []),
    ]);
    revalidateJob(jobId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Bookings ───────────────────────────────────────────────────────────────

async function bookingRegionId(bookingId: string) {
  return (
    await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, select: { regionId: true } })
  ).regionId;
}

export async function cancelBookingAction(
  bookingId: string,
  reason: string,
): Promise<ActionResult> {
  try {
    const ctx = await adminCtx();
    assertRegionAccess(ctx, await bookingRegionId(bookingId));
    await cancelBooking(bookingId, actorOf(ctx), reason);
    revalidatePath(`/admin/bookings/${bookingId}`);
    revalidatePath("/admin/calendar");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function pauseBookingAction(
  bookingId: string,
  from: string,
  until: string,
): Promise<ActionResult> {
  try {
    const ctx = await adminCtx();
    assertRegionAccess(ctx, await bookingRegionId(bookingId));
    if (until < from) return { ok: false, message: "Pause end must be after start." };
    await pauseBooking(
      bookingId,
      localDateToDateColumn(from),
      localDateToDateColumn(until),
      actorOf(ctx),
    );
    revalidatePath(`/admin/bookings/${bookingId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function resumeBookingAction(bookingId: string): Promise<ActionResult> {
  try {
    const ctx = await adminCtx();
    assertRegionAccess(ctx, await bookingRegionId(bookingId));
    await resumeBooking(bookingId);
    revalidatePath(`/admin/bookings/${bookingId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function updateBookingNotesAction(
  bookingId: string,
  internalNotes: string,
): Promise<ActionResult> {
  try {
    const ctx = await adminCtx();
    assertRegionAccess(ctx, await bookingRegionId(bookingId));
    await prisma.booking.update({
      where: { id: bookingId },
      data: { internalNotes: internalNotes.trim() || null },
    });
    revalidatePath(`/admin/bookings/${bookingId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Payments ───────────────────────────────────────────────────────────────

export async function chargeNowAction(jobId: string, force = false): Promise<ActionResult> {
  try {
    const ctx = await adminCtx();
    assertRegionAccess(ctx, await jobRegionId(jobId));
    const res = await createServiceCharge(jobId, actorOf(ctx), { force });
    revalidateJob(jobId);
    revalidatePath("/admin/payments");
    return res.ok ? { ok: true, message: "Charged." } : { ok: false, message: res.message };
  } catch (e) {
    return fail(e);
  }
}

export async function refundAction(
  chargeId: string,
  amountCents: number,
  reason: "QUALITY" | "CANCELLED" | "DUPLICATE" | "GOODWILL" | "OTHER",
  note: string,
): Promise<ActionResult> {
  try {
    const ctx = await adminCtx();
    const charge = await prisma.charge.findUniqueOrThrow({
      where: { id: chargeId },
      include: { job: { select: { regionId: true } } },
    });
    if (charge.job) assertRegionAccess(ctx, charge.job.regionId);
    const res = await refundCharge(chargeId, amountCents, reason, note || null, actorOf(ctx));
    if (charge.jobId) revalidateJob(charge.jobId);
    revalidatePath("/admin/payments");
    return res.ok ? { ok: true, message: "Refunded." } : { ok: false, message: res.message };
  } catch (e) {
    return fail(e);
  }
}

export async function waiveAction(jobId: string, note: string): Promise<ActionResult> {
  try {
    const ctx = await adminCtx();
    assertRegionAccess(ctx, await jobRegionId(jobId));
    await waiveJobPayment(jobId, actorOf(ctx), note);
    revalidateJob(jobId);
    revalidatePath("/admin/payments");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Cleaners ───────────────────────────────────────────────────────────────

const cleanerSchema = z.object({
  id: z.string().optional(),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  email: z.string().trim().email(),
  phone: z.string().trim().min(7),
  homeRegionId: z.string().min(1),
  regionIds: z.array(z.string()).default([]),
  status: z.enum(["ONBOARDING", "ACTIVE", "INACTIVE", "SUSPENDED"]),
  backgroundCheckStatus: z.enum(["PENDING", "CLEARED", "FAILED", "EXPIRED"]),
  payType: z.enum(["HOURLY", "PERCENT_OF_JOB", "FLAT_PER_JOB"]),
  payRateCents: z.number().int().min(0).nullable(),
  payPercentBps: z.number().int().min(0).max(10000).nullable(),
  maxJobsPerDay: z.number().int().min(1).max(10),
  skills: z
    .array(z.enum(["DEEP_CLEAN", "MOVE_OUT", "POST_RENO", "COMMERCIAL", "AIRBNB", "LEAD"]))
    .default([]),
  notes: z.string().optional(),
  availability: z
    .array(
      z.object({
        weekday: z.number().int().min(0).max(6),
        startLocal: z.string(),
        endLocal: z.string(),
      }),
    )
    .default([]),
});
export type CleanerInput = z.infer<typeof cleanerSchema>;

export async function saveCleanerAction(
  raw: CleanerInput,
): Promise<ActionResult & { id?: string }> {
  try {
    const ctx = await adminCtx();
    const d = cleanerSchema.parse(raw);
    assertRegionAccess(ctx, d.homeRegionId);
    for (const r of d.regionIds) assertRegionAccess(ctx, r);
    const email = d.email.toLowerCase();
    const id = await prisma.$transaction(async (tx) => {
      // Invite: a User row with the CLEANER role lets them log in via magic link / OTP.
      const user = await tx.user.upsert({
        where: { organizationId_email: { organizationId: ctx.orgId, email } },
        update: { name: `${d.firstName} ${d.lastName}`, phone: d.phone },
        create: {
          organizationId: ctx.orgId,
          email,
          name: `${d.firstName} ${d.lastName}`,
          phone: d.phone,
          status: "INVITED",
        },
      });
      if (!(await tx.userRole.findFirst({ where: { userId: user.id, role: "CLEANER" } })))
        await tx.userRole.create({ data: { userId: user.id, role: "CLEANER" } });
      const base = {
        firstName: d.firstName,
        lastName: d.lastName,
        email,
        phone: d.phone,
        homeRegionId: d.homeRegionId,
        status: d.status,
        backgroundCheckStatus: d.backgroundCheckStatus,
        backgroundCheckAt: d.backgroundCheckStatus === "CLEARED" ? new Date() : undefined,
        payType: d.payType,
        payRateCents: d.payType === "PERCENT_OF_JOB" ? null : d.payRateCents,
        payPercentBps: d.payType === "PERCENT_OF_JOB" ? d.payPercentBps : null,
        maxJobsPerDay: d.maxJobsPerDay,
        notes: d.notes?.trim() || null,
        userId: user.id,
      };
      const cleaner = d.id
        ? await tx.cleaner.update({ where: { id: d.id }, data: base })
        : await tx.cleaner.create({ data: { ...base, organizationId: ctx.orgId } });
      await tx.cleanerRegion.deleteMany({ where: { cleanerId: cleaner.id } });
      const regionSet = new Set([d.homeRegionId, ...d.regionIds]);
      await tx.cleanerRegion.createMany({
        data: [...regionSet].map((regionId) => ({ cleanerId: cleaner.id, regionId })),
      });
      await tx.cleanerSkill.deleteMany({ where: { cleanerId: cleaner.id } });
      if (d.skills.length)
        await tx.cleanerSkill.createMany({
          data: d.skills.map((skill) => ({ cleanerId: cleaner.id, skill })),
        });
      await tx.cleanerAvailability.deleteMany({ where: { cleanerId: cleaner.id } });
      if (d.availability.length)
        await tx.cleanerAvailability.createMany({
          data: d.availability.map((a) => ({
            cleanerId: cleaner.id,
            ...a,
            effectiveFrom: new Date("2020-01-01T00:00:00Z"),
          })),
        });
      return cleaner.id;
    });
    revalidatePath("/admin/cleaners");
    revalidatePath(`/admin/cleaners/${id}`);
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

// ── Customers ──────────────────────────────────────────────────────────────

export async function anonymizeCustomerAction(customerId: string): Promise<ActionResult> {
  try {
    const ctx = await getCtx("SUPER_ADMIN");
    const open = await prisma.job.count({
      where: {
        customerId,
        status: { in: ["PENDING", "CONFIRMED", "ASSIGNED", "EN_ROUTE", "IN_PROGRESS"] },
      },
    });
    if (open)
      return {
        ok: false,
        message: `Cancel the customer's ${open} open visit${open > 1 ? "s" : ""} first.`,
      };
    await anonymizeCustomer(customerId, actorOf(ctx));
    revalidatePath(`/admin/customers/${customerId}`);
    revalidatePath("/admin/customers");
    return { ok: true, message: "Personal data removed. Financial records kept." };
  } catch (e) {
    return fail(e);
  }
}

export async function updateCustomerNotesAction(
  customerId: string,
  notes: string,
): Promise<ActionResult> {
  try {
    await adminCtx();
    await prisma.customer.update({
      where: { id: customerId },
      data: { notes: notes.trim() || null },
    });
    revalidatePath(`/admin/customers/${customerId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Regions ────────────────────────────────────────────────────────────────

const regionSchema = z.object({
  name: z.string().trim().min(1),
  phone: z.string().trim().optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  status: z.enum(["ACTIVE", "COMING_SOON", "PAUSED"]),
  minLeadHours: z.number().int().min(0).max(168),
  maxAdvanceDays: z.number().int().min(1).max(365),
  lateCancelWindowHours: z.number().int().min(0).max(168),
  lateCancelFeeType: z.enum(["FIXED", "PERCENT"]),
  lateCancelFeeValue: z.number().int().min(0),
  requireCleanerAcceptance: z.boolean(),
  capacityMode: z.enum(["FIXED", "DERIVED"]).default("FIXED"),
});
export type RegionInput = z.infer<typeof regionSchema>;

export async function updateRegionAction(
  regionId: string,
  raw: RegionInput,
): Promise<ActionResult> {
  try {
    const ctx = await getCtx("SUPER_ADMIN");
    const d = regionSchema.parse(raw);
    assertRegionAccess(ctx, regionId);
    await prisma.region.update({
      where: { id: regionId },
      data: { ...d, email: d.email || null, phone: d.phone || null },
    });
    revalidatePath(`/admin/regions/${regionId}`);
    revalidatePath("/admin/regions");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setCapacityAction(
  regionId: string,
  windowId: string,
  weekday: number,
  capacity: number,
): Promise<ActionResult> {
  try {
    const ctx = await adminCtx();
    assertRegionAccess(ctx, regionId);
    const existing = await prisma.windowCapacity.findFirst({
      where: { regionId, windowId, weekday },
    });
    if (existing)
      await prisma.windowCapacity.update({ where: { id: existing.id }, data: { capacity } });
    else await prisma.windowCapacity.create({ data: { regionId, windowId, weekday, capacity } });
    revalidatePath(`/admin/regions/${regionId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function addBlackoutAction(
  regionId: string,
  date: string,
  windowId: string | null,
  reason: string,
): Promise<ActionResult> {
  try {
    const ctx = await adminCtx();
    assertRegionAccess(ctx, regionId);
    await prisma.blackoutDate.create({
      data: {
        regionId,
        date: localDateToDateColumn(date),
        windowId: windowId || null,
        reason: reason || null,
      },
    });
    revalidatePath(`/admin/regions/${regionId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function removeBlackoutAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await adminCtx();
    const b = await prisma.blackoutDate.findUniqueOrThrow({ where: { id } });
    assertRegionAccess(ctx, b.regionId);
    await prisma.blackoutDate.delete({ where: { id } });
    revalidatePath(`/admin/regions/${b.regionId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Pricing tables ─────────────────────────────────────────────────────────

/** Clone a table (any status) into a new DRAFT version for the same scope. */
export async function cloneDraftPricingAction(
  sourceTableId: string,
  regionId?: string | null,
): Promise<ActionResult & { id?: string }> {
  try {
    const ctx = await getCtx("SUPER_ADMIN");
    const src = await prisma.pricingTable.findUniqueOrThrow({
      where: { id: sourceTableId },
      include: { rates: true },
    });
    const scopeRegionId = regionId === undefined ? src.regionId : regionId;
    const latest = await prisma.pricingTable.findFirst({
      where: { organizationId: ctx.orgId, regionId: scopeRegionId },
      orderBy: { version: "desc" },
    });
    const created = await prisma.pricingTable.create({
      data: {
        organizationId: ctx.orgId,
        regionId: scopeRegionId,
        version: (latest?.version ?? 0) + 1,
        status: "DRAFT",
        effectiveFrom: new Date(),
        notes: `Cloned from v${src.version}${src.regionId ? "" : " (default)"}`,
        rates: {
          create: src.rates.map((r) => ({
            kind: r.kind,
            key: r.key,
            amountCents: r.amountCents,
            bps: r.bps,
            minutes: r.minutes,
          })),
        },
      },
    });
    revalidatePath("/admin/pricing");
    return { ok: true, id: created.id };
  } catch (e) {
    return fail(e);
  }
}

export async function updateRateAction(
  tableId: string,
  rateId: string,
  fields: { amountCents?: number | null; bps?: number | null; minutes?: number | null },
): Promise<ActionResult> {
  try {
    await getCtx("SUPER_ADMIN");
    const table = await prisma.pricingTable.findUniqueOrThrow({ where: { id: tableId } });
    if (table.status !== "DRAFT")
      return { ok: false, message: "Only draft tables can be edited. Clone it first." };
    await prisma.pricingRate.update({
      where: { id: rateId, pricingTableId: tableId },
      data: fields,
    });
    revalidatePath(`/admin/pricing/${tableId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function publishPricingAction(
  tableId: string,
  effectiveFrom: string,
): Promise<ActionResult> {
  try {
    await getCtx("SUPER_ADMIN");
    const table = await prisma.pricingTable.findUniqueOrThrow({ where: { id: tableId } });
    if (table.status !== "DRAFT") return { ok: false, message: "Table is not a draft." };
    await prisma.pricingTable.update({
      where: { id: tableId },
      data: { status: "PUBLISHED", effectiveFrom: new Date(`${effectiveFrom}T00:00:00Z`) },
    });
    revalidatePath("/admin/pricing");
    revalidatePath(`/admin/pricing/${tableId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function archivePricingAction(tableId: string): Promise<ActionResult> {
  try {
    await getCtx("SUPER_ADMIN");
    await prisma.pricingTable.update({ where: { id: tableId }, data: { status: "ARCHIVED" } });
    revalidatePath("/admin/pricing");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
