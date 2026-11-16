import { describe, expect, it } from "vitest";
import type { RateKind } from "@/generated/prisma/enums";
import { bathroomKey, bedroomKey, computeQuote, sqftBandKey } from "./engine";
import type { QuoteInput, RateValue, ResolvedRates, TaxLine } from "./types";

const table: Record<string, RateValue> = {
  "BASE:standard": { amountCents: 9900, minutes: 120 },
  "BASE:deep": { amountCents: 14900, minutes: 180 },
  "BEDROOM:0": { amountCents: 0, minutes: 0 },
  "BEDROOM:1": { amountCents: 2000, minutes: 20 },
  "BEDROOM:2": { amountCents: 4000, minutes: 40 },
  "BEDROOM:3": { amountCents: 6000, minutes: 60 },
  "BEDROOM:6+": { amountCents: 12000, minutes: 120 },
  "BATHROOM:1": { amountCents: 0, minutes: 0 },
  "BATHROOM:1.5": { amountCents: 1500, minutes: 15 },
  "BATHROOM:2": { amountCents: 3000, minutes: 30 },
  "BATHROOM:5+": { amountCents: 10500, minutes: 105 },
  "SQFT_BAND:1500-1999": { amountCents: 3000, minutes: 30 },
  "EXTRA:inside-fridge": { amountCents: 3500, minutes: 30 },
  "EXTRA:laundry": { amountCents: 2500, minutes: 30 },
  "FIRST_CLEAN_UPGRADE:deep": { amountCents: 9900, minutes: 60 },
  "FREQUENCY_DISCOUNT:WEEKLY": { bps: 2000 },
  "FREQUENCY_DISCOUNT:BIWEEKLY": { bps: 1500 },
  "FREQUENCY_DISCOUNT:EVERY_4_WEEKS": { bps: 1000 },
  "HOURLY_RATE:per-cleaner-hour": { amountCents: 5900 },
  "HOURLY_MIN:min": { minutes: 180 },
  "MIN_JOB:min": { amountCents: 9900 },
};

const rates: ResolvedRates = {
  pricingTableId: "t1",
  get: (kind: RateKind, key: string) => table[`${kind}:${key}`],
};

const ON: TaxLine[] = [{ name: "HST", rateBps: 1300, taxRateId: "hst" }];
const BC: TaxLine[] = [
  { name: "GST", rateBps: 500, taxRateId: "gst" },
  { name: "PST", rateBps: 700, taxRateId: "pst" },
];

const base: QuoteInput = {
  regionId: "r",
  province: "ON",
  serviceSlug: "standard",
  pricingModel: "FLAT",
  bedrooms: 3,
  bathrooms: 2,
  extras: [],
  frequency: "ONE_TIME",
  isFirstOccurrence: true,
  serviceDate: "2026-10-03",
};

describe("keys", () => {
  it("maps bedrooms/bathrooms/sqft to rate keys", () => {
    expect(bedroomKey(0)).toBe("0");
    expect(bedroomKey(7)).toBe("6+");
    expect(bathroomKey(1)).toBe("1");
    expect(bathroomKey(1.5)).toBe("1.5");
    expect(bathroomKey(2.4)).toBe("2.5");
    expect(bathroomKey(6)).toBe("5+");
    expect(sqftBandKey(1600)).toBe("1500-1999");
    expect(sqftBandKey(9000)).toBe("4000+");
  });
});

describe("computeQuote", () => {
  it("Toronto 3bd/2ba one-time standard with HST", () => {
    const q = computeQuote(base, rates, ON);
    expect(q.subtotalCents).toBe(9900 + 6000 + 3000); // 18900
    expect(q.taxCents).toBe(2457);
    expect(q.totalCents).toBe(21357);
    expect(q.estimatedMinutes).toBe(120 + 60 + 30);
  });

  it("bi-weekly with 2 extras applies 15% to the whole subtotal, then tax", () => {
    const q = computeQuote(
      {
        ...base,
        frequency: "BIWEEKLY",
        extras: [
          { slug: "inside-fridge", qty: 1 },
          { slug: "laundry", qty: 2 },
        ],
      },
      rates,
      ON,
    );
    // subtotal 18900 + 3500 + 5000 = 27400; discount -4110; taxable 23290; HST 3028
    expect(q.subtotalCents).toBe(27400);
    expect(q.discountCents).toBe(-4110);
    expect(q.taxableCents).toBe(23290);
    expect(q.taxCents).toBe(3028);
    expect(q.totalCents).toBe(26318);
  });

  it("first-clean deep upgrade applies only on the first occurrence", () => {
    const first = computeQuote({ ...base, firstCleanUpgradeSlug: "deep" }, rates, ON);
    const later = computeQuote(
      { ...base, firstCleanUpgradeSlug: "deep", isFirstOccurrence: false },
      rates,
      ON,
    );
    expect(first.subtotalCents - later.subtotalCents).toBe(9900);
    expect(first.estimatedMinutes - later.estimatedMinutes).toBe(60);
  });

  it("BC computes GST and PST as separately rounded lines", () => {
    const q = computeQuote({ ...base, province: "BC", bedrooms: 1, bathrooms: 1.5 }, rates, BC);
    // subtotal 9900 + 2000 + 1500 = 13400; GST 670; PST 938
    expect(q.lines.filter((l) => l.step === "TAX").map((l) => l.amountCents)).toEqual([670, 938]);
    expect(q.totalCents).toBe(13400 + 670 + 938);
  });

  it("promo: percent stacks after the frequency discount and is capped", () => {
    const q = computeQuote(
      {
        ...base,
        frequency: "WEEKLY",
        promo: {
          code: "WELCOME10",
          type: "PERCENT",
          value: 1000,
          appliesTo: "FIRST_JOB",
          minSubtotalCents: 0,
          maxDiscountCents: 1000,
        },
      },
      rates,
      ON,
    );
    // 18900 - 20% = 15120; 10% = 1512 capped to 1000
    const promo = q.lines.find((l) => l.step === "PROMO");
    expect(promo?.amountCents).toBe(-1000);
    expect(q.taxableCents).toBe(14120);
  });

  it("promo for first job only warns on later occurrences", () => {
    const q = computeQuote(
      {
        ...base,
        isFirstOccurrence: false,
        promo: {
          code: "X",
          type: "FIXED",
          value: 500,
          appliesTo: "FIRST_JOB",
          minSubtotalCents: 0,
        },
      },
      rates,
      ON,
    );
    expect(q.lines.some((l) => l.step === "PROMO")).toBe(false);
    expect(q.warnings.length).toBe(1);
  });

  it("hourly enforces the 3-hour minimum and treats extras as included", () => {
    const q = computeQuote(
      {
        ...base,
        serviceSlug: "hourly",
        pricingModel: "HOURLY",
        hourly: { hours: 2, cleaners: 2 },
        extras: [{ slug: "inside-oven", qty: 1 }],
      },
      rates,
      ON,
    );
    expect(q.subtotalCents).toBe(5900 * 3 * 2);
    expect(q.warnings[0]).toMatch(/minimum/);
    expect(q.estimatedMinutes).toBe(360);
  });

  it("applies the minimum job floor", () => {
    const q = computeQuote(
      { ...base, bedrooms: 0, bathrooms: 1, serviceSlug: "standard" },
      {
        ...rates,
        get: (k, key) => (k === "BASE" ? { amountCents: 5000, minutes: 60 } : rates.get(k, key)),
      },
      ON,
    );
    expect(q.lines.find((l) => l.step === "MIN_JOB_FLOOR")?.amountCents).toBe(4900);
    expect(q.subtotalCents).toBe(9900);
  });

  it("tip is untaxed and excluded from total", () => {
    const q = computeQuote({ ...base, tipCents: 1000 }, rates, ON);
    expect(q.totalCents).toBe(21357);
    expect(q.grandTotalCents).toBe(22357);
  });
});
