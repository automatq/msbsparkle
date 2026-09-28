"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCtx } from "@/modules/auth/session";
import { prisma } from "@/modules/db/client";
import type { ActionResult } from "./actions";

function fail(e: unknown): ActionResult {
  return { ok: false, message: e instanceof Error ? e.message : "Something went wrong" };
}

const promoSchema = z.object({
  id: z.string().optional(),
  code: z
    .string()
    .trim()
    .min(3)
    .max(32)
    .transform((s) => s.toUpperCase()),
  type: z.enum(["PERCENT", "FIXED"]),
  value: z.number().int().min(1),
  appliesTo: z.enum(["FIRST_JOB", "ALL_JOBS"]),
  minSubtotalCents: z.number().int().min(0).default(0),
  maxDiscountCents: z.number().int().min(0).nullable().default(null),
  maxRedemptions: z.number().int().min(1).nullable().default(null),
  perCustomerLimit: z.number().int().min(1).default(1),
  newCustomersOnly: z.boolean().default(false),
  regionIds: z.array(z.string()).default([]),
  startsAt: z.string().optional().or(z.literal("")),
  endsAt: z.string().optional().or(z.literal("")),
  active: z.boolean().default(true),
});
export type PromoInput = z.input<typeof promoSchema>;

export async function savePromoAction(raw: PromoInput): Promise<ActionResult> {
  try {
    const ctx = await getCtx("SUPER_ADMIN");
    const d = promoSchema.parse(raw);
    const data = {
      code: d.code,
      type: d.type,
      value: d.value,
      appliesTo: d.appliesTo,
      minSubtotalCents: d.minSubtotalCents,
      maxDiscountCents: d.maxDiscountCents,
      maxRedemptions: d.maxRedemptions,
      perCustomerLimit: d.perCustomerLimit,
      newCustomersOnly: d.newCustomersOnly,
      regionIds: d.regionIds,
      startsAt: d.startsAt ? new Date(d.startsAt) : null,
      endsAt: d.endsAt ? new Date(`${d.endsAt}T23:59:59Z`) : null,
      active: d.active,
    };
    if (d.id) await prisma.promoCode.update({ where: { id: d.id }, data });
    else await prisma.promoCode.create({ data: { ...data, organizationId: ctx.orgId } });
    revalidatePath("/admin/promos");
    return { ok: true, message: "Promo saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function togglePromoAction(id: string, active: boolean): Promise<ActionResult> {
  try {
    await getCtx("SUPER_ADMIN");
    await prisma.promoCode.update({ where: { id }, data: { active } });
    revalidatePath("/admin/promos");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setApplicationStatusAction(
  id: string,
  status: "NEW" | "REVIEWING" | "INTERVIEW" | "HIRED" | "REJECTED",
  notes?: string,
): Promise<ActionResult> {
  try {
    await getCtx("SUPER_ADMIN", "REGION_ADMIN");
    await prisma.cleanerApplication.update({
      where: { id },
      data: { status, notes: notes?.trim() || undefined },
    });
    revalidatePath("/admin/applications");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const citySchema = z.object({
  name: z.string().trim().min(1),
  seoTitle: z.string().trim().max(120).optional().or(z.literal("")),
  seoDescription: z.string().trim().max(300).optional().or(z.literal("")),
  intro: z.string().trim().max(2000).optional().or(z.literal("")),
  neighborhoods: z.array(z.string().trim().min(1)).default([]),
  faqs: z.array(z.object({ q: z.string().trim().min(1), a: z.string().trim().min(1) })).default([]),
  active: z.boolean().default(true),
});
export type CityInput = z.input<typeof citySchema>;

export async function saveCityAction(id: string, raw: CityInput): Promise<ActionResult> {
  try {
    await getCtx("SUPER_ADMIN");
    const d = citySchema.parse(raw);
    const city = await prisma.city.update({
      where: { id },
      data: {
        name: d.name,
        seoTitle: d.seoTitle || null,
        seoDescription: d.seoDescription || null,
        intro: d.intro || null,
        neighborhoods: d.neighborhoods,
        faqs: d.faqs,
        active: d.active,
      },
    });
    revalidatePath(`/house-cleaning-service-${city.slug}`);
    revalidatePath("/locations");
    revalidatePath(`/admin/cities/${id}`);
    return { ok: true, message: "City page updated and republished." };
  } catch (e) {
    return fail(e);
  }
}
