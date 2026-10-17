import type { Frequency, PricingModel, Province, RateKind } from "@/generated/prisma/enums";

export const ENGINE_VERSION = "2026.09.1";

export type ExtraSelection = { slug: string; qty: number };

export type PromoInput = {
  code: string;
  type: "PERCENT" | "FIXED";
  /** bps for PERCENT, cents for FIXED */
  value: number;
  appliesTo: "FIRST_JOB" | "ALL_JOBS";
  minSubtotalCents: number;
  maxDiscountCents?: number | null;
};

export type QuoteInput = {
  regionId: string;
  province: Province;
  serviceSlug: string;
  pricingModel: PricingModel;
  bedrooms: number;
  bathrooms: number;
  sqft?: number | null;
  extras: ExtraSelection[];
  hourly?: { hours: number; cleaners: number } | null;
  frequency: Frequency;
  isFirstOccurrence: boolean;
  firstCleanUpgradeSlug?: string | null;
  promo?: PromoInput | null;
  tipCents?: number;
  /** Local service date "YYYY-MM-DD"; selects tax rates. */
  serviceDate: string;
};

export type RateValue = {
  amountCents?: number | null;
  bps?: number | null;
  minutes?: number | null;
};

export type ResolvedRates = {
  pricingTableId: string;
  get(kind: RateKind, key: string): RateValue | undefined;
};

export type TaxLine = { name: string; rateBps: number; taxRateId: string };

export type QuoteStep =
  | "BASE"
  | "BEDROOM"
  | "BATHROOM"
  | "SQFT"
  | "SERVICE_SURCHARGE"
  | "HOURLY"
  | "EXTRA"
  | "FIRST_CLEAN_UPGRADE"
  | "MIN_JOB_FLOOR"
  | "FREQUENCY_DISCOUNT"
  | "PROMO"
  | "ADJUSTMENT"
  | "TAX";

export type QuoteLine = {
  step: QuoteStep;
  key: string;
  label: string;
  qty: number;
  unitCents: number;
  /** Negative for discounts. */
  amountCents: number;
  meta?: Record<string, unknown>;
};

export type QuoteResult = {
  engineVersion: string;
  lines: QuoteLine[];
  subtotalCents: number;
  discountCents: number;
  taxableCents: number;
  taxCents: number;
  totalCents: number;
  tipCents: number;
  grandTotalCents: number;
  estimatedMinutes: number;
  warnings: string[];
};
