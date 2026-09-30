import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/modules/db/client";
import type { Actor } from "@/modules/jobs/state-machine";
import { recomputeQuote } from "@/modules/pricing/quote-service";
import type { ExtraSelection, QuoteInput, QuoteLine } from "@/modules/pricing/types";
import { MATERIALIZE_HORIZON_DAYS, materializeJobs } from "@/modules/scheduling/materialize";
import {
  addLocalDays,
  dateColumnToLocalDate,
  localDateToDateColumn,
  todayIn,
  weekdayOf,
} from "@/modules/shared/dates";
import { bpsOf } from "@/modules/shared/money";
import { bookingQuoteInput } from "./quote-input";

export type SeriesChanges = {
  frequency?: "WEEKLY" | "BIWEEKLY" | "EVERY_4_WEEKS";
  windowId?: string;
  /** New first date for the re-anchored series (schedule edits). Defaults to the next editable visit's date. */
  startDate?: string;
  bedrooms?: number;
  bathrooms?: number;
  sqft?: number | null;
  extras?: ExtraSelection[];
};

const EDITABLE = ["PENDING", "CONFIRMED", "ASSIGNED"] as const;

async function load(bookingId: string) {
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { region: { include: { windows: true } }, window: true, address: true, service: true },
  });
  const jobs = await prisma.job.findMany({
    where: { bookingId },
    orderBy: { sequenceNumber: "asc" },
    include: {
      activeQuote: true,
      assignments: { where: { status: { in: ["ACCEPTED", "OFFERED"] } } },
    },
  });
  const editable = jobs.filter(
    (j) => (EDITABLE as readonly string[]).includes(j.status) && !j.detached && !j.priceLockedAt,
  );
  return { booking, jobs, editable };
}

function isScheduleChange(
  b: { frequency: string; windowId: string; anchorDate: Date },
  c: SeriesChanges,
  nextDate: string | null,
): boolean {
  return (
    (!!c.frequency && c.frequency !== b.frequency) ||
    (!!c.windowId && c.windowId !== b.windowId) ||
    (!!c.startDate && c.startDate !== nextDate)
  );
}

function applyConfig(input: QuoteInput, c: SeriesChanges): QuoteInput {
  return {
    ...input,
    frequency: c.frequency ?? input.frequency,
    bedrooms: c.bedrooms ?? input.bedrooms,
    bathrooms: c.bathrooms ?? input.bathrooms,
    sqft: c.sqft === undefined ? input.sqft : c.sqft,
    extras: c.extras ?? input.extras,
  };
}

export type SeriesEditPreview = {
  currentCents: number;
  newCents: number;
  affectedVisits: number;
  keptVisits: number;
  scheduleChange: boolean;
  assignmentsRemoved: number;
  firstDate: string | null;
};

/** What an "all future visits" edit would do, without changing anything. */
export async function previewSeriesEdit(
  bookingId: string,
  changes: SeriesChanges,
): Promise<SeriesEditPreview> {
  const { booking, jobs, editable } = await load(bookingId);
  const nextDate = editable[0] ? dateColumnToLocalDate(editable[0].scheduledDate) : null;
  const base = await bookingQuoteInput(bookingId);
  const date = changes.startDate ?? nextDate ?? todayIn(booking.region.timezone);
  const [cur, next] = await Promise.all([
    recomputeQuote(booking.organizationId, base, date),
    recomputeQuote(booking.organizationId, applyConfig(base, changes), date),
  ]);
  const schedule = isScheduleChange(booking, changes, nextDate);
  return {
    currentCents: cur.quote.totalCents,
    newCents: next.quote.totalCents,
    affectedVisits: editable.length,
    keptVisits:
      jobs.filter((j) => (EDITABLE as readonly string[]).includes(j.status)).length -
      editable.length,
    scheduleChange: schedule,
    assignmentsRemoved: schedule ? editable.reduce((n, j) => n + j.assignments.length, 0) : 0,
    firstDate: schedule ? date : nextDate,
  };
}

export type SeriesEditResult =
  | { ok: true; repriced: number; regenerated: number; assignmentsRemoved: number }
  | { ok: false; message: string };

/**
 * "This and all future visits". Locked (inside the cutoff), individually edited (detached),
 * started and past visits are never touched.
 * - Config edits (size, extras) re-price editable visits in place and keep their cleaners.
 * - Schedule edits (frequency, window, start date) delete editable visits and regenerate the
 *   series from the new anchor; assignments on those visits are removed.
 */
export async function applySeriesEdit(
  bookingId: string,
  changes: SeriesChanges,
  actor: Actor,
): Promise<SeriesEditResult> {
  const { booking, jobs, editable } = await load(bookingId);
  if (booking.frequency === "ONE_TIME")
    return {
      ok: false,
      message: "One-time bookings don't have a series to edit. Reschedule the visit instead.",
    };
  if (!["ACTIVE", "PAUSED"].includes(booking.status))
    return { ok: false, message: "This plan is no longer active." };
  if (
    changes.windowId &&
    !booking.region.windows.some((w) => w.id === changes.windowId && w.active)
  )
    return { ok: false, message: "That arrival window isn't available in this region." };
  if (changes.bedrooms !== undefined && (changes.bedrooms < 0 || changes.bedrooms > 12))
    return { ok: false, message: "Check the bedroom count." };
  if (changes.bathrooms !== undefined && (changes.bathrooms < 1 || changes.bathrooms > 12))
    return { ok: false, message: "Check the bathroom count." };
  const today = todayIn(booking.region.timezone);
  const nextDate = editable[0] ? dateColumnToLocalDate(editable[0].scheduledDate) : null;
  const schedule = isScheduleChange(booking, changes, nextDate);
  if (changes.startDate && changes.startDate < addLocalDays(today, 1))
    return { ok: false, message: "The new start date must be at least tomorrow." };

  const configPatch: Prisma.BookingUncheckedUpdateInput = {
    ...(changes.bedrooms !== undefined ? { bedrooms: changes.bedrooms } : {}),
    ...(changes.bathrooms !== undefined ? { bathrooms: changes.bathrooms.toString() } : {}),
    ...(changes.sqft !== undefined ? { sqft: changes.sqft } : {}),
    ...(changes.extras ? { extras: changes.extras as unknown as Prisma.InputJsonValue } : {}),
  };
  const before = {
    frequency: booking.frequency,
    windowId: booking.windowId,
    bedrooms: booking.bedrooms,
    bathrooms: booking.bathrooms.toString(),
    extras: booking.extras,
  };

  if (!schedule) {
    await prisma.booking.update({ where: { id: bookingId }, data: configPatch });
    const template = await bookingQuoteInput(bookingId);
    let repriced = 0;
    for (const job of editable) {
      const date = dateColumnToLocalDate(job.scheduledDate);
      const input: QuoteInput = {
        ...template,
        isFirstOccurrence: job.sequenceNumber === 1,
        firstCleanUpgradeSlug: job.isFirstCleanUpgrade ? template.firstCleanUpgradeSlug : null,
      };
      const { rates, quote } = await recomputeQuote(booking.organizationId, input, date);
      await prisma.$transaction(async (tx) => {
        const q = await tx.priceQuote.create({
          data: {
            bookingId,
            regionId: booking.regionId,
            pricingTableId: rates.pricingTableId,
            engineVersion: quote.engineVersion,
            inputs: { ...input, serviceDate: date } as unknown as Prisma.InputJsonValue,
            lines: quote.lines as unknown as Prisma.InputJsonValue,
            subtotalCents: quote.subtotalCents,
            discountCents: quote.discountCents,
            taxableCents: quote.taxableCents,
            taxCents: quote.taxCents,
            totalCents: quote.totalCents,
            estimatedMinutes: quote.estimatedMinutes,
            reason: actor.type === "CUSTOMER" ? "CUSTOMER_EDIT" : "ADMIN_ADJUSTMENT",
            createdByUserId: actor.type === "ADMIN" ? (actor.id ?? null) : null,
          },
        });
        if (job.activeQuoteId)
          await tx.priceQuote.update({ where: { id: job.activeQuoteId }, data: { jobId: null } });
        await tx.priceQuote.update({ where: { id: q.id }, data: { jobId: job.id } });
        await tx.job.update({
          where: { id: job.id },
          data: {
            activeQuoteId: q.id,
            estimatedMinutes: quote.estimatedMinutes,
            bedrooms: input.bedrooms,
            bathrooms: input.bathrooms.toString(),
            sqft: input.sqft ?? null,
            extras: input.extras as unknown as Prisma.InputJsonValue,
          },
        });
        await tx.jobEvent.create({
          data: {
            jobId: job.id,
            type: "REPRICED",
            actorType: actor.type,
            actorId: actor.id ?? null,
            data: {
              from: job.activeQuote?.totalCents ?? null,
              to: quote.totalCents,
              reason: "series edit",
            },
          },
        });
      });
      repriced++;
    }
    await audit(booking, actor, before, changes, { repriced });
    return { ok: true, repriced, regenerated: 0, assignmentsRemoved: 0 };
  }

  // Schedule edit: re-anchor and regenerate.
  const newAnchor = changes.startDate ?? nextDate ?? addLocalDays(today, 1);
  const window = booking.region.windows.find(
    (w) => w.id === (changes.windowId ?? booking.windowId),
  )!;
  const assignmentsRemoved = editable.reduce((n, j) => n + j.assignments.length, 0);
  const keepMaxSeq = Math.max(
    0,
    ...jobs.filter((j) => !editable.includes(j)).map((j) => j.sequenceNumber),
  );
  const horizon = addLocalDays(today > newAnchor ? today : newAnchor, MATERIALIZE_HORIZON_DAYS);
  const created = await prisma.$transaction(
    async (tx) => {
      await tx.job.deleteMany({ where: { id: { in: editable.map((j) => j.id) } } });
      const updated = await tx.booking.update({
        where: { id: bookingId },
        data: {
          ...configPatch,
          frequency: changes.frequency ?? booking.frequency,
          windowId: window.id,
          anchorDate: localDateToDateColumn(newAnchor),
          weekday: weekdayOf(newAnchor),
          generatedThrough: localDateToDateColumn(addLocalDays(newAnchor, -1)),
          sequenceOffset: keepMaxSeq,
        },
      });
      const template = applyConfig(await bookingQuoteInput(bookingId), changes);
      return materializeJobs(
        tx,
        updated,
        {
          timezone: booking.region.timezone,
          windowStartLocal: window.startLocal,
          windowEndLocal: window.endLocal,
          addressSnapshot: {
            line1: booking.address.line1,
            line2: booking.address.line2,
            city: booking.address.city,
            province: booking.address.province,
            postalCode: booking.address.postalCode,
            entryInstructions: booking.address.entryInstructions,
            parkingInstructions: booking.address.parkingInstructions,
          } as Prisma.InputJsonValue,
          quoteInput: { ...template, frequency: updated.frequency },
          firstUpgradeSlug: null,
        },
        horizon,
      );
    },
    { timeout: 30_000 },
  );
  await audit(booking, actor, before, changes, {
    regenerated: created.length,
    assignmentsRemoved,
    newAnchor,
  });
  return { ok: true, repriced: 0, regenerated: created.length, assignmentsRemoved };
}

async function audit(
  booking: { id: string; organizationId: string; regionId: string },
  actor: Actor,
  before: unknown,
  changes: SeriesChanges,
  result: Record<string, unknown>,
) {
  await prisma.auditLog.create({
    data: {
      organizationId: booking.organizationId,
      regionId: booking.regionId,
      actorType: actor.type,
      actorId: actor.id ?? null,
      entityType: "Booking",
      entityId: booking.id,
      action: "booking.edit_all_future",
      before: before as Prisma.InputJsonValue,
      after: { changes, result } as unknown as Prisma.InputJsonValue,
    },
  });
}

/**
 * One-off admin price change on a single visit, expressed pre-tax. Creates a new immutable quote
 * with an ADJUSTMENT line and recomputed tax; works even after the price lock.
 */
export async function adjustJobPrice(
  jobId: string,
  deltaCents: number,
  note: string,
  actor: Actor,
): Promise<{ ok: true; totalCents: number } | { ok: false; message: string }> {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: { activeQuote: true },
  });
  if (!job.activeQuote) return { ok: false, message: "This visit has no price to adjust." };
  if (["PAID", "REFUNDED", "PARTIALLY_REFUNDED"].includes(job.paymentStatus))
    return { ok: false, message: "This visit has already been charged. Use a refund instead." };
  if (!Number.isInteger(deltaCents) || deltaCents === 0)
    return { ok: false, message: "Enter a non-zero amount." };
  const old = job.activeQuote;
  const lines = (old.lines as unknown as QuoteLine[]).filter((l) => l.step !== "TAX");
  const taxLines = (old.lines as unknown as QuoteLine[]).filter((l) => l.step === "TAX");
  const taxable = old.taxableCents + deltaCents;
  if (taxable < 0) return { ok: false, message: "The adjustment is larger than the visit price." };
  const adj: QuoteLine = {
    step: "ADJUSTMENT",
    key: "admin",
    label: note ? `Adjustment: ${note}` : "Adjustment",
    qty: 1,
    unitCents: deltaCents,
    amountCents: deltaCents,
    meta: { by: actor.id ?? null },
  };
  const newTax = taxLines.map((t) => {
    const bps = Number((t.meta as { rateBps?: number } | undefined)?.rateBps ?? 0);
    const amt = bpsOf(taxable, bps);
    return { ...t, unitCents: amt, amountCents: amt };
  });
  const tax = newTax.reduce((s, t) => s + t.amountCents, 0);
  const q = await prisma.$transaction(async (tx) => {
    const created = await tx.priceQuote.create({
      data: {
        bookingId: job.bookingId,
        regionId: old.regionId,
        pricingTableId: old.pricingTableId,
        engineVersion: old.engineVersion,
        inputs: old.inputs as Prisma.InputJsonValue,
        lines: [...lines, adj, ...newTax] as unknown as Prisma.InputJsonValue,
        subtotalCents: old.subtotalCents,
        discountCents: old.discountCents + (deltaCents < 0 ? deltaCents : 0),
        taxableCents: taxable,
        taxCents: tax,
        totalCents: taxable + tax,
        estimatedMinutes: old.estimatedMinutes,
        reason: "ADMIN_ADJUSTMENT",
        createdByUserId: actor.id ?? null,
      },
    });
    await tx.priceQuote.update({ where: { id: old.id }, data: { jobId: null } });
    await tx.priceQuote.update({ where: { id: created.id }, data: { jobId: job.id } });
    await tx.job.update({
      where: { id: job.id },
      data: { activeQuoteId: created.id, detached: true },
    });
    await tx.jobEvent.create({
      data: {
        jobId: job.id,
        type: "REPRICED",
        actorType: actor.type,
        actorId: actor.id ?? null,
        data: { from: old.totalCents, to: created.totalCents, deltaCents, note },
      },
    });
    return created;
  });
  return { ok: true, totalCents: q.totalCents };
}
