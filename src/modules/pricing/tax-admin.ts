import { prisma } from "@/modules/db/client";
import { country, type CountryProfile } from "@/modules/shared/country";
import { localDateToDateColumn } from "@/modules/shared/dates";

/** "13", "13%", "4.712" → basis points (1300, 1300, 471). Rejects anything outside 0–30%. */
export function parseRatePercent(input: string): number | null {
  const m = input.trim().replace(/%$/, "").trim();
  if (!/^\d+(\.\d{1,3})?$/.test(m)) return null;
  const bps = Math.round(Number(m) * 100);
  return bps > 0 && bps <= 3000 ? bps : null;
}

export class TaxRateError extends Error {}

export type NewTaxRate = {
  province: string;
  name: string;
  rateBps: number;
  /** Local date (YYYY-MM-DD) the rate applies from. */
  effectiveFrom: string;
};

/**
 * Adds a tax rate. A rate with the same province and name that is still open-ended is closed the
 * day the new one starts, so changing a rate is just adding the new one. Rates are never edited in
 * place: quotes keep pointing at the rate they were priced with.
 */
export async function addTaxRate(input: NewTaxRate, profile: CountryProfile = country) {
  const name = input.name.trim();
  if (!name || name.length > 40) throw new TaxRateError("Enter a tax name (e.g. HST, Sales tax).");
  if (!profile.subdivisions.some((s) => s.code === input.province))
    throw new TaxRateError(`Choose a ${profile.subdivisionLabel.toLowerCase()}.`);
  if (!Number.isInteger(input.rateBps) || input.rateBps <= 0 || input.rateBps > 3000)
    throw new TaxRateError("Enter a rate between 0 and 30%.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom))
    throw new TaxRateError("Choose a start date.");
  const from = localDateToDateColumn(input.effectiveFrom);

  return prisma.$transaction(async (tx) => {
    const open = await tx.taxRate.findMany({
      where: { province: input.province, name, effectiveTo: null },
    });
    if (open.some((r) => r.effectiveFrom >= from))
      throw new TaxRateError(
        `${name} already has a rate starting on or after ${input.effectiveFrom}. End that one first.`,
      );
    await tx.taxRate.updateMany({
      where: { id: { in: open.map((r) => r.id) } },
      data: { effectiveTo: from },
    });
    return tx.taxRate.create({
      data: { province: input.province, name, rateBps: input.rateBps, effectiveFrom: from },
    });
  });
}

/** Stops a rate applying from a local date (it no longer applies on that date). */
export async function endTaxRate(id: string, endDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) throw new TaxRateError("Choose an end date.");
  const to = localDateToDateColumn(endDate);
  const rate = await prisma.taxRate.findUniqueOrThrow({ where: { id } });
  if (to <= rate.effectiveFrom)
    throw new TaxRateError("The end date must be after the date the rate started.");
  return prisma.taxRate.update({ where: { id }, data: { effectiveTo: to } });
}

/** Deletes a rate that has not started yet (a mistake); rates already in use can only be ended. */
export async function deleteScheduledTaxRate(id: string, today: string) {
  const rate = await prisma.taxRate.findUniqueOrThrow({ where: { id } });
  if (rate.effectiveFrom <= localDateToDateColumn(today))
    throw new TaxRateError("This rate has already applied to quotes; end it instead.");
  await prisma.taxRate.delete({ where: { id } });
}
