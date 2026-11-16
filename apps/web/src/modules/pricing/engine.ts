import { bpsOf } from "@/modules/shared/money";
import {
  ENGINE_VERSION,
  type QuoteInput,
  type QuoteLine,
  type QuoteResult,
  type ResolvedRates,
  type TaxLine,
} from "./types";

export function bedroomKey(bedrooms: number): string {
  const n = Math.max(0, Math.floor(bedrooms));
  return n >= 6 ? "6+" : String(n);
}

export function bathroomKey(bathrooms: number): string {
  const n = Math.max(1, Math.round(bathrooms * 2) / 2);
  if (n >= 5) return "5+";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function sqftBandKey(sqft: number): string {
  if (sqft < 1000) return "0-999";
  if (sqft < 1500) return "1000-1499";
  if (sqft < 2000) return "1500-1999";
  if (sqft < 3000) return "2000-2999";
  if (sqft < 4000) return "3000-3999";
  return "4000+";
}

const FREQUENCY_LABEL: Record<string, string> = {
  WEEKLY: "Weekly discount",
  BIWEEKLY: "Bi-weekly discount",
  EVERY_4_WEEKS: "Monthly discount",
};

/**
 * Pure pricing function. Fixed step order; every percentage uses bpsOf().
 * base -> extras -> first-clean upgrade -> min-job floor -> frequency discount -> promo -> tax -> tip.
 */
export function computeQuote(
  input: QuoteInput,
  rates: ResolvedRates,
  taxes: TaxLine[],
): QuoteResult {
  const lines: QuoteLine[] = [];
  const warnings: string[] = [];
  let minutes = 0;

  const push = (line: QuoteLine, lineMinutes = 0) => {
    lines.push(line);
    minutes += lineMinutes;
  };

  // 1. Base
  if (input.pricingModel === "HOURLY") {
    const rate = rates.get("HOURLY_RATE", "per-cleaner-hour")?.amountCents ?? 0;
    const minHours = (rates.get("HOURLY_MIN", "min")?.minutes ?? 180) / 60;
    const requestedHours = input.hourly?.hours ?? minHours;
    const cleaners = Math.max(1, input.hourly?.cleaners ?? 1);
    const hours = Math.max(requestedHours, minHours);
    if (requestedHours < minHours)
      warnings.push(`Hourly service has a ${minHours}-hour minimum per cleaner.`);
    const qty = hours * cleaners;
    push(
      {
        step: "HOURLY",
        key: input.serviceSlug,
        label: `${hours} hr × ${cleaners} cleaner${cleaners > 1 ? "s" : ""}`,
        qty,
        unitCents: rate,
        amountCents: Math.round(rate * qty),
        meta: { hours, cleaners, minHours },
      },
      Math.round(hours * 60 * cleaners),
    );
  } else {
    const base = rates.get("BASE", input.serviceSlug);
    if (!base) throw new Error(`No BASE rate for service ${input.serviceSlug}`);
    push(
      {
        step: "BASE",
        key: input.serviceSlug,
        label: "Base price",
        qty: 1,
        unitCents: base.amountCents ?? 0,
        amountCents: base.amountCents ?? 0,
      },
      base.minutes ?? 0,
    );
    const bk = bedroomKey(input.bedrooms);
    const bed = rates.get("BEDROOM", bk);
    if (bed && (bed.amountCents || bed.minutes)) {
      push(
        {
          step: "BEDROOM",
          key: bk,
          label: `${bk} bedroom${bk === "1" ? "" : "s"}`,
          qty: 1,
          unitCents: bed.amountCents ?? 0,
          amountCents: bed.amountCents ?? 0,
        },
        bed.minutes ?? 0,
      );
    }
    const bak = bathroomKey(input.bathrooms);
    const bath = rates.get("BATHROOM", bak);
    if (bath && (bath.amountCents || bath.minutes)) {
      push(
        {
          step: "BATHROOM",
          key: bak,
          label: `${bak} bathroom${bak === "1" ? "" : "s"}`,
          qty: 1,
          unitCents: bath.amountCents ?? 0,
          amountCents: bath.amountCents ?? 0,
        },
        bath.minutes ?? 0,
      );
    }
    if (input.sqft) {
      const sk = sqftBandKey(input.sqft);
      const sq = rates.get("SQFT_BAND", sk);
      if (sq && (sq.amountCents || sq.minutes)) {
        push(
          {
            step: "SQFT",
            key: sk,
            label: `${sk} sq ft`,
            qty: 1,
            unitCents: sq.amountCents ?? 0,
            amountCents: sq.amountCents ?? 0,
          },
          sq.minutes ?? 0,
        );
      }
    }
    const surcharge = rates.get("SERVICE_SURCHARGE", input.serviceSlug);
    if (surcharge?.amountCents) {
      push(
        {
          step: "SERVICE_SURCHARGE",
          key: input.serviceSlug,
          label: "Service surcharge",
          qty: 1,
          unitCents: surcharge.amountCents,
          amountCents: surcharge.amountCents,
        },
        surcharge.minutes ?? 0,
      );
    }
  }

  // 2. Extras
  for (const sel of input.extras) {
    if (sel.qty <= 0) continue;
    const rate = rates.get("EXTRA", sel.slug);
    if (!rate) {
      warnings.push(`Unknown extra "${sel.slug}" ignored.`);
      continue;
    }
    if (input.pricingModel === "HOURLY") {
      push(
        {
          step: "EXTRA",
          key: sel.slug,
          label: sel.slug,
          qty: sel.qty,
          unitCents: 0,
          amountCents: 0,
          meta: { includedInHourly: true },
        },
        (rate.minutes ?? 0) * sel.qty,
      );
      continue;
    }
    push(
      {
        step: "EXTRA",
        key: sel.slug,
        label: sel.slug,
        qty: sel.qty,
        unitCents: rate.amountCents ?? 0,
        amountCents: (rate.amountCents ?? 0) * sel.qty,
      },
      (rate.minutes ?? 0) * sel.qty,
    );
  }

  // 3. First-clean upgrade
  if (input.isFirstOccurrence && input.firstCleanUpgradeSlug && input.pricingModel === "FLAT") {
    if (input.firstCleanUpgradeSlug === input.serviceSlug) {
      warnings.push("Upgrade skipped: booked service already is the upgrade.");
    } else {
      const up = rates.get("FIRST_CLEAN_UPGRADE", input.firstCleanUpgradeSlug);
      if (up?.amountCents) {
        push(
          {
            step: "FIRST_CLEAN_UPGRADE",
            key: input.firstCleanUpgradeSlug,
            label: "First-clean upgrade",
            qty: 1,
            unitCents: up.amountCents,
            amountCents: up.amountCents,
          },
          up.minutes ?? 0,
        );
      }
    }
  }

  // 4. Minimum job floor
  let subtotal = lines.reduce((s, l) => s + l.amountCents, 0);
  const minJob = rates.get("MIN_JOB", "min")?.amountCents ?? 0;
  if (minJob && subtotal < minJob) {
    const diff = minJob - subtotal;
    push({
      step: "MIN_JOB_FLOOR",
      key: "min",
      label: "Minimum job adjustment",
      qty: 1,
      unitCents: diff,
      amountCents: diff,
    });
    subtotal = minJob;
  }

  // 5. Frequency discount
  let discount = 0;
  if (input.frequency !== "ONE_TIME") {
    const bps = rates.get("FREQUENCY_DISCOUNT", input.frequency)?.bps ?? 0;
    if (bps > 0) {
      const amt = -bpsOf(subtotal, bps);
      push({
        step: "FREQUENCY_DISCOUNT",
        key: input.frequency,
        label: FREQUENCY_LABEL[input.frequency] ?? "Recurring discount",
        qty: 1,
        unitCents: amt,
        amountCents: amt,
        meta: { bps, appliedTo: subtotal },
      });
      discount += amt;
    }
  }

  // 6. Promo
  if (input.promo) {
    const p = input.promo;
    const afterFreq = subtotal + discount;
    const eligible = p.appliesTo === "ALL_JOBS" || input.isFirstOccurrence;
    if (!eligible) {
      warnings.push("Promo code applies to the first clean only.");
    } else if (afterFreq < p.minSubtotalCents) {
      warnings.push("Promo code requires a higher subtotal and was not applied.");
    } else {
      let amt = p.type === "PERCENT" ? bpsOf(afterFreq, p.value) : p.value;
      if (p.maxDiscountCents != null) amt = Math.min(amt, p.maxDiscountCents);
      amt = Math.min(amt, afterFreq);
      if (amt > 0) {
        push({
          step: "PROMO",
          key: p.code,
          label: `Promo ${p.code}`,
          qty: 1,
          unitCents: -amt,
          amountCents: -amt,
          meta: { type: p.type, value: p.value },
        });
        discount -= amt;
      }
    }
  }

  // 7. Tax, each line rounded independently
  const taxable = subtotal + discount;
  let tax = 0;
  for (const t of taxes) {
    const amt = bpsOf(taxable, t.rateBps);
    push({
      step: "TAX",
      key: t.name,
      label: `${t.name} (${(t.rateBps / 100).toFixed(t.rateBps % 100 ? 1 : 0)}%)`,
      qty: 1,
      unitCents: amt,
      amountCents: amt,
      meta: { rateBps: t.rateBps, taxRateId: t.taxRateId },
    });
    tax += amt;
  }

  const total = taxable + tax;
  const tip = Math.max(0, Math.round(input.tipCents ?? 0));

  return {
    engineVersion: ENGINE_VERSION,
    lines,
    subtotalCents: subtotal,
    discountCents: discount,
    taxableCents: taxable,
    taxCents: tax,
    totalCents: total,
    tipCents: tip,
    grandTotalCents: total + tip,
    estimatedMinutes: minutes,
    warnings,
  };
}
