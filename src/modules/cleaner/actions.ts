"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCtx } from "@/modules/auth/session";
import { createEarningForAssignment } from "@/modules/cleaner/earnings";
import { prisma } from "@/modules/db/client";
import { transitionJob, type Actor } from "@/modules/jobs/state-machine";
import { emit } from "@/modules/jobs/client";
import { putObject } from "@/modules/storage/local";

export type CleanerActionResult =
  { ok: true; message?: string; warnings?: string[] } | { ok: false; message: string };

async function me() {
  const ctx = await getCtx("CLEANER", "SUPER_ADMIN");
  const cleaner = await prisma.cleaner.findFirst({ where: { userId: ctx.userId } });
  if (!cleaner) throw new Error("No cleaner profile linked to this login.");
  return { ctx, cleaner, actor: { type: "CLEANER", id: cleaner.id } as Actor };
}

async function myAssignment(jobId: string, cleanerId: string) {
  const a = await prisma.assignment.findUnique({
    where: { jobId_cleanerId: { jobId, cleanerId } },
    include: { job: { include: { address: true, service: true } } },
  });
  if (!a || !["OFFERED", "ACCEPTED"].includes(a.status))
    throw new Error("This job is not assigned to you.");
  return a;
}

function fail(e: unknown): CleanerActionResult {
  return { ok: false, message: e instanceof Error ? e.message : "Something went wrong" };
}
function revalidate(jobId: string) {
  revalidatePath("/cleaner");
  revalidatePath(`/cleaner/jobs/${jobId}`);
  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath("/admin/calendar");
}

/** Copies the service's checklist template onto the job the first time it is needed. */
async function ensureChecklist(jobId: string) {
  const count = await prisma.jobChecklistItem.count({ where: { jobId } });
  if (count) return;
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: {
      service: {
        include: { checklistTemplate: { include: { items: { orderBy: { sortOrder: "asc" } } } } },
      },
    },
  });
  const items = job.service.checklistTemplate?.items ?? [];
  if (!items.length) return;
  await prisma.jobChecklistItem.createMany({
    data: items.map((i) => ({
      jobId,
      section: i.section,
      label: i.label,
      sortOrder: i.sortOrder,
      requiresPhoto: i.requiresPhoto,
    })),
  });
}

export async function respondToOfferAction(
  jobId: string,
  accept: boolean,
): Promise<CleanerActionResult> {
  try {
    const { cleaner, actor } = await me();
    const a = await myAssignment(jobId, cleaner.id);
    if (a.status !== "OFFERED") return { ok: false, message: "This offer was already answered." };
    await prisma.$transaction(async (tx) => {
      await tx.assignment.update({
        where: { id: a.id },
        data: { status: accept ? "ACCEPTED" : "DECLINED", respondedAt: new Date() },
      });
      await tx.jobEvent.create({
        data: {
          jobId,
          type: accept ? "ASSIGNED" : "UNASSIGNED",
          actorType: "CLEANER",
          actorId: cleaner.id,
          data: { cleanerId: cleaner.id, status: accept ? "ACCEPTED" : "DECLINED" },
        },
      });
      if (accept && a.job.status === "CONFIRMED") await transitionJob(tx, jobId, "ASSIGNED", actor);
    });
    if (accept) await ensureChecklist(jobId);
    revalidate(jobId);
    return { ok: true, message: accept ? "Job accepted" : "Offer declined" };
  } catch (e) {
    return fail(e);
  }
}

const geo = z
  .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
  .nullable();

export async function enRouteAction(jobId: string): Promise<CleanerActionResult> {
  try {
    const { cleaner, actor } = await me();
    await myAssignment(jobId, cleaner.id);
    await prisma.$transaction((tx) => transitionJob(tx, jobId, "EN_ROUTE", actor));
    revalidate(jobId);
    return { ok: true, message: "Customer will be told you're on your way" };
  } catch (e) {
    return fail(e);
  }
}

export async function checkInAction(
  jobId: string,
  position: { lat: number; lng: number } | null,
): Promise<CleanerActionResult> {
  try {
    const { cleaner, actor } = await me();
    const a = await myAssignment(jobId, cleaner.id);
    if (a.status !== "ACCEPTED") return { ok: false, message: "Accept the job first." };
    if (a.checkInAt) return { ok: false, message: "Already checked in." };
    const pos = geo.parse(position);
    const warnings: string[] = [];
    if (pos && a.job.address.lat != null && a.job.address.lng != null) {
      const km = haversineKm(pos, { lat: a.job.address.lat, lng: a.job.address.lng });
      if (km > 0.3) warnings.push(`You appear to be ${km.toFixed(1)} km from the address.`);
    }
    await prisma.$transaction(async (tx) => {
      await tx.assignment.update({
        where: { id: a.id },
        data: { checkInAt: new Date(), checkInLat: pos?.lat ?? null, checkInLng: pos?.lng ?? null },
      });
      if (a.job.status === "ASSIGNED" || a.job.status === "EN_ROUTE")
        await transitionJob(tx, jobId, "IN_PROGRESS", actor, { cleanerId: cleaner.id });
      if (warnings.length)
        await tx.jobEvent.create({
          data: {
            jobId,
            type: "GEOFENCE_WARNING",
            actorType: "CLEANER",
            actorId: cleaner.id,
            data: { warnings, pos },
          },
        });
    });
    await ensureChecklist(jobId);
    revalidate(jobId);
    return { ok: true, message: "Checked in", warnings };
  } catch (e) {
    return fail(e);
  }
}

export async function toggleChecklistAction(
  jobId: string,
  itemId: string,
  done: boolean,
): Promise<CleanerActionResult> {
  try {
    const { cleaner } = await me();
    await myAssignment(jobId, cleaner.id);
    await prisma.jobChecklistItem.update({
      where: { id: itemId, jobId },
      data: {
        completedAt: done ? new Date() : null,
        completedByCleanerId: done ? cleaner.id : null,
      },
    });
    await prisma.jobEvent.create({
      data: {
        jobId,
        type: "CHECKLIST",
        actorType: "CLEANER",
        actorId: cleaner.id,
        data: { itemId, done },
      },
    });
    revalidatePath(`/cleaner/jobs/${jobId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function uploadPhotoAction(
  jobId: string,
  kind: "BEFORE" | "AFTER" | "ISSUE",
  formData: FormData,
): Promise<CleanerActionResult> {
  try {
    const { cleaner } = await me();
    await myAssignment(jobId, cleaner.id);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0)
      return { ok: false, message: "Choose a photo." };
    if (file.size > 12 * 1024 * 1024)
      return { ok: false, message: "Photo is too large (12 MB max)." };
    if (!file.type.startsWith("image/")) return { ok: false, message: "Only images are allowed." };
    const buf = Buffer.from(await file.arrayBuffer());
    const { key, url } = await putObject(
      `jobs/${jobId}`,
      file.name || `${kind.toLowerCase()}.jpg`,
      buf,
    );
    await prisma.jobPhoto.create({
      data: { jobId, cleanerId: cleaner.id, kind, storageKey: key, url },
    });
    await prisma.jobEvent.create({
      data: {
        jobId,
        type: "PHOTO",
        actorType: "CLEANER",
        actorId: cleaner.id,
        data: { kind, key },
      },
    });
    revalidate(jobId);
    return { ok: true, message: "Photo added" };
  } catch (e) {
    return fail(e);
  }
}

/** Check-out. The lead's check-out completes the job when required checklist items are done. */
export async function checkOutAction(
  jobId: string,
  position: { lat: number; lng: number } | null,
): Promise<CleanerActionResult> {
  try {
    const { cleaner, actor } = await me();
    const a = await myAssignment(jobId, cleaner.id);
    if (!a.checkInAt) return { ok: false, message: "Check in first." };
    if (a.checkOutAt) return { ok: false, message: "Already checked out." };
    const pos = geo.parse(position);
    const missing = await prisma.jobChecklistItem.count({
      where: { jobId, requiresPhoto: true, completedAt: null },
    });
    if (missing)
      return {
        ok: false,
        message: `${missing} required checklist item${missing > 1 ? "s" : ""} still open.`,
      };
    let completed = false;
    await prisma.$transaction(async (tx) => {
      await tx.assignment.update({
        where: { id: a.id },
        data: {
          checkOutAt: new Date(),
          checkOutLat: pos?.lat ?? null,
          checkOutLng: pos?.lng ?? null,
        },
      });
      const others = await tx.assignment.count({
        where: { jobId, status: "ACCEPTED", checkOutAt: null, id: { not: a.id } },
      });
      if (a.role === "LEAD" || others === 0) {
        if (a.job.status === "IN_PROGRESS") {
          await transitionJob(tx, jobId, "COMPLETED", actor, { cleanerId: cleaner.id });
          completed = true;
          const accepted = await tx.assignment.findMany({ where: { jobId, status: "ACCEPTED" } });
          for (const x of accepted) await createEarningForAssignment(tx, x.id);
        }
      }
    });
    if (completed) await emit("job/completed", { jobId });
    revalidate(jobId);
    revalidatePath("/cleaner/earnings");
    return { ok: true, message: completed ? "Job complete. Nice work!" : "Checked out" };
  } catch (e) {
    return fail(e);
  }
}

const availabilitySchema = z.array(
  z.object({
    weekday: z.number().int().min(0).max(6),
    startLocal: z.string().regex(/^\d{2}:\d{2}$/),
    endLocal: z.string().regex(/^\d{2}:\d{2}$/),
  }),
);

export async function saveAvailabilityAction(raw: unknown): Promise<CleanerActionResult> {
  try {
    const { cleaner } = await me();
    const rows = availabilitySchema.parse(raw);
    await prisma.$transaction([
      prisma.cleanerAvailability.deleteMany({ where: { cleanerId: cleaner.id } }),
      prisma.cleanerAvailability.createMany({
        data: rows.map((r) => ({
          cleanerId: cleaner.id,
          ...r,
          effectiveFrom: new Date("2020-01-01T00:00:00Z"),
        })),
      }),
    ]);
    revalidatePath("/cleaner/availability");
    return { ok: true, message: "Availability saved" };
  } catch (e) {
    return fail(e);
  }
}

export async function requestTimeOffAction(
  startsAt: string,
  endsAt: string,
  reason: string,
): Promise<CleanerActionResult> {
  try {
    const { cleaner } = await me();
    const s = new Date(`${startsAt}T00:00:00Z`);
    const e = new Date(`${endsAt}T23:59:59Z`);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s)
      return { ok: false, message: "Check the dates." };
    await prisma.timeOff.create({
      data: { cleanerId: cleaner.id, startsAt: s, endsAt: e, reason: reason || null },
    });
    revalidatePath("/cleaner/availability");
    return { ok: true, message: "Time off requested" };
  } catch (e) {
    return fail(e);
  }
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
