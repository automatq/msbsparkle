import { prisma } from "@/modules/db/client";
import type { ExtraSelection, QuoteInput } from "@/modules/pricing/types";
import { dateColumnToLocalDate } from "@/modules/shared/dates";

/** The pricing input implied by a booking's current configuration (for recurring occurrences). */
export async function bookingQuoteInput(bookingId: string): Promise<QuoteInput> {
  const b = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { region: true, service: true, promoCode: true, firstCleanUpgrade: true },
  });
  return {
    regionId: b.regionId,
    province: b.region.province,
    serviceSlug: b.service.slug,
    pricingModel: b.service.pricingModel,
    bedrooms: b.bedrooms,
    bathrooms: Number(b.bathrooms),
    sqft: b.sqft,
    extras: (b.extras as unknown as ExtraSelection[]) ?? [],
    hourly:
      b.service.pricingModel === "HOURLY"
        ? { hours: Number(b.hourlyHours ?? 3), cleaners: b.hourlyCleaners ?? 1 }
        : null,
    frequency: b.frequency,
    isFirstOccurrence: false,
    firstCleanUpgradeSlug: b.firstCleanUpgrade?.slug ?? null,
    promo:
      b.promoCode && b.promoCode.appliesTo === "ALL_JOBS" && b.promoCode.active
        ? {
            code: b.promoCode.code,
            type: b.promoCode.type,
            value: b.promoCode.value,
            appliesTo: b.promoCode.appliesTo,
            minSubtotalCents: b.promoCode.minSubtotalCents,
            maxDiscountCents: b.promoCode.maxDiscountCents,
          }
        : null,
    serviceDate: dateColumnToLocalDate(b.anchorDate),
  };
}
