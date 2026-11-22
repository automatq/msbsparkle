"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ForbiddenError, getCtx } from "@/modules/auth/session";
import {
  CatalogError,
  deleteChecklist,
  deleteExtra,
  deleteService,
  saveChecklist,
  saveExtra,
  saveService,
  type ChecklistInput,
  type ExtraInput,
  type ServiceInput,
} from "@/modules/catalog/catalog";
import type { ActionResult } from "./actions";

/** Catalog actions for super admins. The rules live in modules/catalog. */

function fail(e: unknown): ActionResult {
  if (e instanceof z.ZodError)
    return { ok: false, message: e.issues[0]?.message ?? "Check the form." };
  if (e instanceof CatalogError || e instanceof ForbiddenError)
    return { ok: false, message: e.message };
  console.error("[catalog]", e);
  return { ok: false, message: "Something went wrong. Try again." };
}

/** The admin pages, plus the public pages that list services and extras (cached for an hour). */
function refresh(serviceSlug?: string) {
  revalidatePath("/admin/catalog", "layout");
  revalidatePath("/admin/pricing", "layout");
  revalidatePath("/");
  revalidatePath("/services");
  if (serviceSlug) revalidatePath(`/services/${serviceSlug}`);
}

async function run(
  message: string,
  fn: (ctx: Awaited<ReturnType<typeof getCtx>>) => Promise<{ slug?: string } | void>,
): Promise<ActionResult> {
  try {
    const res = await fn(await getCtx("SUPER_ADMIN"));
    refresh(res?.slug);
    return { ok: true, message };
  } catch (e) {
    return fail(e);
  }
}

export async function saveServiceAction(input: ServiceInput): Promise<ActionResult> {
  return run(input.id ? "Service saved" : "Service added", (ctx) => saveService(ctx, input));
}

export async function deleteServiceAction(id: string): Promise<ActionResult> {
  return run("Service deleted", (ctx) => deleteService(ctx, id));
}

export async function saveExtraAction(input: ExtraInput): Promise<ActionResult> {
  return run(input.id ? "Add-on saved" : "Add-on added", (ctx) => saveExtra(ctx, input));
}

export async function deleteExtraAction(id: string): Promise<ActionResult> {
  return run("Add-on deleted", (ctx) => deleteExtra(ctx, id));
}

export async function saveChecklistAction(input: ChecklistInput): Promise<ActionResult> {
  return run(input.id ? "Checklist saved" : "Checklist added", async (ctx) => {
    await saveChecklist(ctx, input);
  });
}

export async function deleteChecklistAction(id: string): Promise<ActionResult> {
  return run("Checklist deleted", (ctx) => deleteChecklist(ctx, id));
}
