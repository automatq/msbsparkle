"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRegionAccess, getCtx } from "@/modules/auth/session";
import { prisma } from "@/modules/db/client";
import {
  TaxRateError,
  addTaxRate,
  deleteScheduledTaxRate,
  endTaxRate,
  parseRatePercent,
} from "@/modules/pricing/tax-admin";
import {
  RegionInputError,
  addServiceAreas,
  createRegionWithDefaults,
  parseAreaPrefixes,
} from "@/modules/regions/manage";
import { country, timezone } from "@/modules/shared/country";
import { todayIn } from "@/modules/shared/dates";
import type { ActionResult } from "./actions";

function fail(e: unknown): { ok: false; message: string } {
  if (e instanceof RegionInputError || e instanceof TaxRateError || e instanceof z.ZodError)
    return { ok: false, message: e instanceof z.ZodError ? "Please check the form." : e.message };
  if (e instanceof Error && /Unauthorized|Forbidden|access/i.test(e.message))
    return { ok: false, message: e.message };
  console.error(e);
  return { ok: false, message: "Something went wrong" };
}

// ── Regions ────────────────────────────────────────────────────────────────

const newRegionSchema = z.object({
  name: z.string().trim().min(1).max(80),
  province: z.string().trim().min(1).max(10),
  timezone: z.string().trim().min(1),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  createCityPage: z.boolean().default(true),
});
export type NewRegionInput = z.input<typeof newRegionSchema>;

export async function createRegionAction(
  raw: NewRegionInput,
): Promise<{ ok: true; regionId: string } | { ok: false; message: string }> {
  try {
    const ctx = await getCtx("SUPER_ADMIN");
    const d = newRegionSchema.parse(raw);
    const region = await prisma.$transaction((tx) =>
      createRegionWithDefaults(ctx.orgId, { ...d, status: "COMING_SOON" }, tx),
    );
    revalidatePath("/admin/regions");
    return { ok: true, regionId: region.id };
  } catch (e) {
    return fail(e);
  }
}

// ── Service areas ──────────────────────────────────────────────────────────

export async function addServiceAreasAction(regionId: string, text: string): Promise<ActionResult> {
  try {
    const ctx = await getCtx("SUPER_ADMIN", "REGION_ADMIN");
    assertRegionAccess(ctx, regionId);
    const region = await prisma.region.findUniqueOrThrow({ where: { id: regionId } });
    if (region.organizationId !== ctx.orgId) throw new Error("Forbidden");
    const { valid, invalid } = parseAreaPrefixes(text);
    if (!valid.length)
      return {
        ok: false,
        message: invalid.length
          ? `Not valid ${country.areaLabel}s: ${invalid.join(", ")}. ${country.areaHint}.`
          : `Enter at least one ${country.areaLabel}.`,
      };
    const res = await addServiceAreas(regionId, valid);
    revalidatePath(`/admin/regions/${regionId}`);
    revalidatePath("/admin/regions");
    const warnings = [
      ...(invalid.length ? [`Skipped invalid: ${invalid.join(", ")}`] : []),
      ...(res.alreadyHere.length ? [`Already in this region: ${res.alreadyHere.join(", ")}`] : []),
      ...res.elsewhere.map((e) => `${e.prefix} already belongs to ${e.regionName}`),
    ];
    return {
      ok: true,
      message: `Added ${res.added.length} area${res.added.length === 1 ? "" : "s"}.`,
      warnings,
    };
  } catch (e) {
    return fail(e);
  }
}

async function ownedArea(id: string) {
  const ctx = await getCtx("SUPER_ADMIN", "REGION_ADMIN");
  const area = await prisma.serviceArea.findUniqueOrThrow({
    where: { id },
    include: { region: { select: { organizationId: true } } },
  });
  if (area.region.organizationId !== ctx.orgId) throw new Error("Forbidden");
  assertRegionAccess(ctx, area.regionId);
  return area;
}

export async function setServiceAreaActiveAction(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  try {
    const area = await ownedArea(id);
    await prisma.serviceArea.update({ where: { id }, data: { active } });
    revalidatePath(`/admin/regions/${area.regionId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function removeServiceAreaAction(id: string): Promise<ActionResult> {
  try {
    const area = await ownedArea(id);
    await prisma.serviceArea.delete({ where: { id } });
    revalidatePath(`/admin/regions/${area.regionId}`);
    revalidatePath("/admin/regions");
    return { ok: true, message: `Removed ${area.postalPrefix}.` };
  } catch (e) {
    return fail(e);
  }
}

// ── Tax rates ──────────────────────────────────────────────────────────────

const taxSchema = z.object({
  province: z.string().trim().min(1).max(10),
  name: z.string().trim().min(1).max(40),
  rate: z.string().trim().min(1),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type TaxRateInput = z.infer<typeof taxSchema>;

export async function addTaxRateAction(raw: TaxRateInput): Promise<ActionResult> {
  try {
    await getCtx("SUPER_ADMIN");
    const d = taxSchema.parse(raw);
    const rateBps = parseRatePercent(d.rate);
    if (rateBps === null)
      return { ok: false, message: "Enter a rate between 0 and 30%, e.g. 13 or 4.712." };
    await addTaxRate({
      province: d.province,
      name: d.name,
      rateBps,
      effectiveFrom: d.effectiveFrom,
    });
    revalidatePath("/admin/taxes");
    return { ok: true, message: "Tax rate saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function endTaxRateAction(id: string, endDate: string): Promise<ActionResult> {
  try {
    await getCtx("SUPER_ADMIN");
    await endTaxRate(id, endDate);
    revalidatePath("/admin/taxes");
    return { ok: true, message: "Tax rate ended." };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteTaxRateAction(id: string): Promise<ActionResult> {
  try {
    await getCtx("SUPER_ADMIN");
    await deleteScheduledTaxRate(id, todayIn(timezone));
    revalidatePath("/admin/taxes");
    return { ok: true, message: "Scheduled rate deleted." };
  } catch (e) {
    return fail(e);
  }
}
