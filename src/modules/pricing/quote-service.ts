import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/modules/db/client";
import { findRegionByFsa, normalizePostal } from "@/modules/regions/lookup";
import { todayIn } from "@/modules/shared/dates";
import { computeQuote } from "./engine";
import { resolveRates } from "./resolve-rates";
import type { QuoteRequest } from "./schemas";
import { getTaxLines } from "./tax";
import type { PromoInput, QuoteInput, QuoteResult } from "./types";

export type QuoteError = {
  code: "INVALID_POSTAL" | "OUT_OF_AREA" | "UNKNOWN_SERVICE" | "INVALID_PROMO";
  message: string;
  fsa?: string;
};

export type QuoteSuccess = {
  quoteId: string;
  region: { id: string; slug: string; name: string; province: string; timezone: string };
  service: { id: string; slug: string; name: string; pricingModel: "FLAT" | "HOURLY" };
  input: QuoteInput;
  quote: QuoteResult;
  promo: { id: string; code: string } | null;
};

export async function loadPromo(
  organizationId: string,
  code: string | null | undefined,
  regionId: string,
  serviceId: string,
): Promise<{ id: string; input: PromoInput } | null | "invalid"> {
  if (!code) return null;
  const promo = await prisma.promoCode.findUnique({
    where: { organizationId_code: { organizationId, code: code.toUpperCase() } },
  });
  const now = new Date();
  if (!promo || !promo.active) return "invalid";
  if (promo.startsAt && promo.startsAt > now) return "invalid";
  if (promo.endsAt && promo.endsAt < now) return "invalid";
  if (
    promo.maxRedemptions != null &&
    (await prisma.promoRedemption.count({ where: { promoCodeId: promo.id } })) >=
      promo.maxRedemptions
  )
    return "invalid";
  if (promo.regionIds.length && !promo.regionIds.includes(regionId)) return "invalid";
  if (promo.serviceIds.length && !promo.serviceIds.includes(serviceId)) return "invalid";
  return {
    id: promo.id,
    input: {
      code: promo.code,
      type: promo.type,
      value: promo.value,
      appliesTo: promo.appliesTo,
      minSubtotalCents: promo.minSubtotalCents,
      maxDiscountCents: promo.maxDiscountCents,
    },
  };
}

/** Resolve region/service/promo, run the engine, and persist an anonymous PriceQuote. */
export async function createQuote(
  req: QuoteRequest,
): Promise<{ ok: true; data: QuoteSuccess } | { ok: false; error: QuoteError }> {
  const postal = normalizePostal(req.postalCode);
  if (!postal)
    return {
      ok: false,
      error: { code: "INVALID_POSTAL", message: "Enter a valid Canadian postal code." },
    };
  const region = await findRegionByFsa(postal.fsa);
  if (!region)
    return {
      ok: false,
      error: { code: "OUT_OF_AREA", message: "We don't serve that area yet.", fsa: postal.fsa },
    };

  const service = await prisma.service.findUnique({
    where: {
      organizationId_slug: { organizationId: region.organizationId, slug: req.serviceSlug },
    },
  });
  if (!service || !service.active)
    return { ok: false, error: { code: "UNKNOWN_SERVICE", message: "Unknown service." } };

  const extrasCatalog = await prisma.extra.findMany({
    where: { organizationId: region.organizationId, active: true },
  });
  const extras = req.extras
    .map((e) => {
      const def = extrasCatalog.find((x) => x.slug === e.slug);
      return def ? { slug: e.slug, qty: Math.min(e.qty, def.maxQty) } : null;
    })
    .filter((e): e is { slug: string; qty: number } => !!e && e.qty > 0);

  const promo = await loadPromo(region.organizationId, req.promoCode, region.id, service.id);
  if (promo === "invalid")
    return { ok: false, error: { code: "INVALID_PROMO", message: "That promo code isn't valid." } };

  const serviceDate = req.serviceDate ?? todayIn(region.timezone);
  const input: QuoteInput = {
    regionId: region.id,
    province: region.province,
    serviceSlug: service.slug,
    pricingModel: service.pricingModel,
    bedrooms: req.bedrooms,
    bathrooms: req.bathrooms,
    sqft: req.sqft ?? null,
    extras,
    hourly: service.pricingModel === "HOURLY" ? (req.hourly ?? { hours: 3, cleaners: 1 }) : null,
    frequency: req.frequency,
    isFirstOccurrence: true,
    firstCleanUpgradeSlug: req.firstCleanUpgradeSlug ?? null,
    promo: promo?.input ?? null,
    serviceDate,
  };

  const [rates, taxes] = await Promise.all([
    resolveRates(region.organizationId, region.id),
    getTaxLines(region.province, serviceDate),
  ]);
  const quote = computeQuote(input, rates, taxes);

  const saved = await prisma.priceQuote.create({
    data: {
      regionId: region.id,
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
      reason: "BOOKING",
    },
  });

  return {
    ok: true,
    data: {
      quoteId: saved.id,
      region: {
        id: region.id,
        slug: region.slug,
        name: region.name,
        province: region.province,
        timezone: region.timezone,
      },
      service: {
        id: service.id,
        slug: service.slug,
        name: service.name,
        pricingModel: service.pricingModel,
      },
      input,
      quote,
      promo: promo ? { id: promo.id, code: promo.input.code } : null,
    },
  };
}

/** Recompute a quote from stored inputs against current rates (used at checkout and regeneration). */
export async function recomputeQuote(
  organizationId: string,
  input: QuoteInput,
  serviceDate: string,
) {
  const [rates, taxes] = await Promise.all([
    resolveRates(organizationId, input.regionId),
    getTaxLines(input.province, serviceDate),
  ]);
  return { rates, quote: computeQuote({ ...input, serviceDate }, rates, taxes) };
}
