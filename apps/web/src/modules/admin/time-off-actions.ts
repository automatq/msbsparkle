"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCtx } from "@/modules/auth/session";
import { addTimeOff, decideTimeOff, removeTimeOff } from "@/modules/scheduling/time-off";
import type { ActionResult } from "./actions";

/** Admin actions for cleaner time off. The rules and access checks live in scheduling/time-off. */

const adminCtx = () => getCtx("SUPER_ADMIN", "REGION_ADMIN");
const fail = (e: unknown): ActionResult => ({
  ok: false,
  message:
    e instanceof z.ZodError
      ? (e.issues[0]?.message ?? "Check the form.")
      : e instanceof Error
        ? e.message
        : "Something went wrong",
});

function revalidate(cleanerId?: string) {
  revalidatePath("/admin/cleaners");
  if (cleanerId) revalidatePath(`/admin/cleaners/${cleanerId}`);
  revalidatePath("/admin/calendar");
}

export async function decideTimeOffAction(
  timeOffId: string,
  decision: "APPROVED" | "DENIED",
  cleanerId?: string,
): Promise<ActionResult> {
  try {
    const ctx = await adminCtx();
    const d = z.enum(["APPROVED", "DENIED"]).parse(decision);
    const res = await decideTimeOff(ctx, timeOffId, d);
    revalidate(cleanerId);
    return {
      ok: true,
      message: d === "APPROVED" ? "Time off approved" : "Time off denied",
      warnings: res.warnings,
    };
  } catch (e) {
    return fail(e);
  }
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick both dates.");
const addSchema = z
  .object({ from: day, to: day, reason: z.string().trim().max(300).optional() })
  .refine((v) => v.from <= v.to, "The last day can't be before the first day.");

export async function addTimeOffAction(
  cleanerId: string,
  input: { from: string; to: string; reason?: string },
): Promise<ActionResult> {
  try {
    const ctx = await adminCtx();
    const res = await addTimeOff(ctx, cleanerId, addSchema.parse(input));
    revalidate(cleanerId);
    return { ok: true, message: "Time off added", warnings: res.warnings };
  } catch (e) {
    return fail(e);
  }
}

export async function removeTimeOffAction(
  timeOffId: string,
  cleanerId?: string,
): Promise<ActionResult> {
  try {
    const ctx = await adminCtx();
    await removeTimeOff(ctx, timeOffId);
    revalidate(cleanerId);
    return { ok: true, message: "Time off removed" };
  } catch (e) {
    return fail(e);
  }
}
