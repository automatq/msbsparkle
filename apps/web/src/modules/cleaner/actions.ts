"use server";

import { revalidatePath } from "next/cache";
import { getCtx } from "@/modules/auth/session";
import {
  addPhoto,
  checkIn,
  checkOut,
  goEnRoute,
  requestTimeOff,
  resolveCleanerActor,
  respondToOffer,
  saveAvailability,
  setChecklistItem,
  type CleanerActor,
  type CleanerResult,
  type PhotoKindInput,
  type Position,
} from "@/modules/cleaner/service";

/** Thin Server Action wrappers for the cleaner web portal. The rules live in ./service. */

export type CleanerActionResult =
  { ok: true; message?: string; warnings?: string[] } | { ok: false; message: string };

const INACTIVE: CleanerActionResult = {
  ok: false,
  message: "Your cleaner account isn't active. Contact your dispatcher.",
};

async function withActor(
  fn: (actor: CleanerActor) => Promise<CleanerResult<unknown>>,
): Promise<CleanerActionResult> {
  try {
    const ctx = await getCtx("CLEANER", "SUPER_ADMIN");
    const actor = await resolveCleanerActor(ctx.userId);
    if (!actor) return INACTIVE;
    const r = await fn(actor);
    return r.ok ? { ok: true, message: r.message, warnings: r.warnings } : r;
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Something went wrong" };
  }
}

function revalidateJob(jobId: string) {
  revalidatePath("/cleaner");
  revalidatePath(`/cleaner/jobs/${jobId}`);
  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath("/admin/calendar");
}

export async function respondToOfferAction(jobId: string, accept: boolean) {
  const r = await withActor((a) => respondToOffer(a, jobId, accept));
  revalidateJob(jobId);
  return r;
}

export async function enRouteAction(jobId: string) {
  const r = await withActor((a) => goEnRoute(a, jobId));
  revalidateJob(jobId);
  return r;
}

export async function checkInAction(jobId: string, position: Position) {
  const r = await withActor((a) => checkIn(a, jobId, position));
  revalidateJob(jobId);
  return r;
}

export async function toggleChecklistAction(jobId: string, itemId: string, done: boolean) {
  const r = await withActor((a) => setChecklistItem(a, jobId, itemId, done));
  revalidatePath(`/cleaner/jobs/${jobId}`);
  return r;
}

export async function uploadPhotoAction(jobId: string, kind: PhotoKindInput, formData: FormData) {
  const r = await withActor(async (a) => {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0)
      return { ok: false, code: "INVALID", message: "Choose a photo." };
    return addPhoto(a, jobId, {
      kind,
      bytes: Buffer.from(await file.arrayBuffer()),
      filename: file.name,
    });
  });
  revalidateJob(jobId);
  return r;
}

export async function checkOutAction(jobId: string, position: Position) {
  const r = await withActor((a) => checkOut(a, jobId, position));
  revalidateJob(jobId);
  revalidatePath("/cleaner/earnings");
  return r;
}

export async function saveAvailabilityAction(raw: unknown) {
  const r = await withActor((a) => saveAvailability(a, raw));
  revalidatePath("/cleaner/availability");
  return r;
}

export async function requestTimeOffAction(startsAt: string, endsAt: string, reason: string) {
  const r = await withActor((a) => requestTimeOff(a, { startsAt, endsAt, reason }));
  revalidatePath("/cleaner/availability");
  return r;
}
