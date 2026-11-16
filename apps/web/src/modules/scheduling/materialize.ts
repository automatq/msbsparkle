import type { Prisma } from "@/generated/prisma/client";
import { recomputeQuote } from "@/modules/pricing/quote-service";
import type { QuoteInput } from "@/modules/pricing/types";
import {
  addLocalDays,
  dateColumnToLocalDate,
  localDateToDateColumn,
  zonedToInstant,
  type LocalDate,
} from "@/modules/shared/dates";
import { occurrences } from "./recurrence";

export const MATERIALIZE_HORIZON_DAYS = 56;

type Tx = Prisma.TransactionClient;

export type BookingForMaterialize = {
  id: string;
  organizationId: string;
  regionId: string;
  customerId: string;
  serviceId: string;
  addressId: string;
  frequency: "ONE_TIME" | "WEEKLY" | "BIWEEKLY" | "EVERY_4_WEEKS";
  anchorDate: Date;
  endsOn: Date | null;
  pausedFrom: Date | null;
  pausedUntil: Date | null;
  generatedThrough: Date | null;
  bedrooms: number;
  bathrooms: { toString(): string } | number;
  sqft: number | null;
  hourlyHours: { toString(): string } | number | null;
  hourlyCleaners: number | null;
  extras: unknown;
  firstCleanUpgradeServiceId: string | null;
  customerNotes: string | null;
  defaultTipCents: number;
};

export type MaterializeContext = {
  timezone: string;
  windowStartLocal: string;
  windowEndLocal: string;
  addressSnapshot: Prisma.InputJsonValue;
  /** Quote input template (from the checkout quote); occurrence-specific fields are overridden. */
  quoteInput: QuoteInput;
  /** Pre-persisted quote id to attach to sequence #1, if any. */
  firstQuoteId?: string | null;
  firstUpgradeSlug?: string | null;
};

/**
 * Creates Job rows (with PriceQuotes) for occurrences after `generatedThrough` up to `through`.
 * Idempotent through the (bookingId, sequenceNumber) unique and the cursor.
 */
export async function materializeJobs(
  tx: Tx,
  booking: BookingForMaterialize,
  ctx: MaterializeContext,
  through?: LocalDate,
): Promise<string[]> {
  const anchor = dateColumnToLocalDate(booking.anchorDate);
  const horizon = through ?? addLocalDays(anchor, MATERIALIZE_HORIZON_DAYS);
  const list = occurrences({
    frequency: booking.frequency,
    anchorDate: anchor,
    after: booking.generatedThrough ? dateColumnToLocalDate(booking.generatedThrough) : null,
    through: horizon,
    endsOn: booking.endsOn ? dateColumnToLocalDate(booking.endsOn) : null,
    pausedFrom: booking.pausedFrom ? dateColumnToLocalDate(booking.pausedFrom) : null,
    pausedUntil: booking.pausedUntil ? dateColumnToLocalDate(booking.pausedUntil) : null,
  });
  const created: string[] = [];
  for (const occ of list) {
    const isFirst = occ.sequenceNumber === 1;
    let quoteId: string;
    let estimatedMinutes: number;
    if (isFirst && ctx.firstQuoteId) {
      const q = await tx.priceQuote.findUniqueOrThrow({ where: { id: ctx.firstQuoteId } });
      quoteId = q.id;
      estimatedMinutes = q.estimatedMinutes;
    } else {
      const input: QuoteInput = {
        ...ctx.quoteInput,
        isFirstOccurrence: isFirst,
        firstCleanUpgradeSlug: isFirst ? (ctx.firstUpgradeSlug ?? null) : null,
        promo: isFirst
          ? ctx.quoteInput.promo
          : ctx.quoteInput.promo?.appliesTo === "ALL_JOBS"
            ? ctx.quoteInput.promo
            : null,
      };
      const { rates, quote } = await recomputeQuote(booking.organizationId, input, occ.date);
      const q = await tx.priceQuote.create({
        data: {
          bookingId: booking.id,
          regionId: booking.regionId,
          pricingTableId: rates.pricingTableId,
          engineVersion: quote.engineVersion,
          inputs: input as unknown as Prisma.InputJsonValue,
          lines: quote.lines as unknown as Prisma.InputJsonValue,
          subtotalCents: quote.subtotalCents,
          discountCents: quote.discountCents,
          taxableCents: quote.taxableCents,
          taxCents: quote.taxCents,
          totalCents: quote.totalCents,
          estimatedMinutes: quote.estimatedMinutes,
          reason: isFirst ? "BOOKING" : "REGENERATION",
        },
      });
      quoteId = q.id;
      estimatedMinutes = quote.estimatedMinutes;
    }
    const job = await tx.job.create({
      data: {
        organizationId: booking.organizationId,
        regionId: booking.regionId,
        bookingId: booking.id,
        customerId: booking.customerId,
        sequenceNumber: occ.sequenceNumber,
        status: "CONFIRMED",
        scheduledDate: localDateToDateColumn(occ.date),
        windowStartLocal: ctx.windowStartLocal,
        windowEndLocal: ctx.windowEndLocal,
        timezone: ctx.timezone,
        scheduledStartAt: zonedToInstant(occ.date, ctx.windowStartLocal, ctx.timezone),
        scheduledEndAt: zonedToInstant(occ.date, ctx.windowEndLocal, ctx.timezone),
        estimatedMinutes,
        serviceId: booking.serviceId,
        addressId: booking.addressId,
        addressSnapshot: ctx.addressSnapshot,
        bedrooms: booking.bedrooms,
        bathrooms: booking.bathrooms.toString(),
        sqft: booking.sqft,
        hourlyHours: booking.hourlyHours?.toString() ?? null,
        hourlyCleaners: booking.hourlyCleaners,
        extras: booking.extras as Prisma.InputJsonValue,
        isFirstCleanUpgrade: isFirst && !!booking.firstCleanUpgradeServiceId,
        customerNotes: booking.customerNotes,
        tipCents: booking.defaultTipCents,
        activeQuoteId: quoteId,
      },
    });
    await tx.priceQuote.update({
      where: { id: quoteId },
      data: { jobId: job.id, bookingId: booking.id },
    });
    await tx.jobEvent.create({
      data: {
        jobId: job.id,
        type: "STATUS_CHANGED",
        actorType: "SYSTEM",
        data: { to: "CONFIRMED", sequenceNumber: occ.sequenceNumber },
      },
    });
    created.push(job.id);
  }
  const lastDate =
    list.at(-1)?.date ??
    (booking.generatedThrough ? dateColumnToLocalDate(booking.generatedThrough) : anchor);
  await tx.booking.update({
    where: { id: booking.id },
    data: { generatedThrough: localDateToDateColumn(lastDate > horizon ? lastDate : horizon) },
  });
  return created;
}
