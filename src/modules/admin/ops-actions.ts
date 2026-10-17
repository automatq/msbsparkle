"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRegionAccess, getCtx, type Ctx } from "@/modules/auth/session";
import {
  adjustJobPrice,
  applySeriesEdit,
  previewSeriesEdit,
  type SeriesChanges,
  type SeriesEditPreview,
} from "@/modules/bookings/edit-booking";
import { prisma } from "@/modules/db/client";
import type { Actor } from "@/modules/jobs/state-machine";
import { appUrl, brand, cleanerTarget, notify } from "@/modules/notifications/send";
import {
  adjustEarning,
  approveEarnings,
  cancelPayout,
  createPayouts,
  markPayoutPaid,
  voidEarning,
} from "@/modules/payouts/service";
import type { ActionResult } from "./actions";

const adminCtx = () => getCtx("SUPER_ADMIN", "REGION_ADMIN");
const actorOf = (ctx: Ctx): Actor => ({ type: "ADMIN", id: ctx.userId });
const fail = (e: unknown): ActionResult => ({
  ok: false,
  message: e instanceof Error ? e.message : "Something went wrong",
});
const scopeOf = (ctx: Ctx) => ({ regionIds: ctx.regionIds, all: ctx.isSuperAdmin });

async function assertEarningAccess(ctx: Ctx, earningIds: string[]) {
  if (ctx.isSuperAdmin) return;
  const rows = await prisma.cleanerEarning.findMany({
    where: { id: { in: earningIds } },
    select: { cleaner: { select: { homeRegionId: true } } },
  });
  for (const r of rows) assertRegionAccess(ctx, r.cleaner.homeRegionId);
}
async function assertPayoutAccess(ctx: Ctx, payoutId: string) {
  if (ctx.isSuperAdmin) return;
  const p = await prisma.payout.findUniqueOrThrow({
    where: { id: payoutId },
    select: { cleaner: { select: { homeRegionId: true } } },
  });
  assertRegionAccess(ctx, p.cleaner.homeRegionId);
}

// ── Payouts ────────────────────────────────────────────────────────────────

export async function approveEarningsAction(ids: string[]): Promise<ActionResult> {
  try {
    const ctx = await adminCtx();
    await assertEarningAccess(ctx, ids);
    const n = await approveEarnings(ids, actorOf(ctx));
    revalidatePath("/admin/payouts");
    return { ok: true, message: `Approved ${n} earning${n === 1 ? "" : "s"}.` };
  } catch (e) {
    return fail(e);
  }
}

export async function adjustEarningAction(
  id: string,
  adjustmentCents: number,
): Promise<ActionResult> {
  try {
    const ctx = await adminCtx();
    await assertEarningAccess(ctx, [id]);
    if (!Number.isInteger(adjustmentCents) || Math.abs(adjustmentCents) > 100_000)
      return { ok: false, message: "Adjustment must be within ±$1,000." };
    await adjustEarning(id, adjustmentCents, actorOf(ctx));
    revalidatePath("/admin/payouts");
    return { ok: true, message: "Adjustment saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function voidEarningAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await adminCtx();
    await assertEarningAccess(ctx, [id]);
    await voidEarning(id, actorOf(ctx));
    revalidatePath("/admin/payouts");
    return { ok: true, message: "Earning voided." };
  } catch (e) {
    return fail(e);
  }
}

const period = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function createPayoutsAction(start: string, end: string): Promise<ActionResult> {
  try {
    const ctx = await adminCtx();
    const p = period.parse({ start, end });
    if (p.end < p.start) return { ok: false, message: "Period end must be after start." };
    const res = await createPayouts(
      scopeOf(ctx),
      new Date(`${p.start}T00:00:00Z`),
      new Date(`${p.end}T23:59:59Z`),
      actorOf(ctx),
    );
    revalidatePath("/admin/payouts");
    return res.payouts
      ? {
          ok: true,
          message: `Created ${res.payouts} payout${res.payouts === 1 ? "" : "s"} totalling $${(res.totalCents / 100).toFixed(2)}.`,
        }
      : { ok: false, message: "No approved earnings in that period." };
  } catch (e) {
    return fail(e);
  }
}

export async function markPayoutPaidAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await adminCtx();
    await assertPayoutAccess(ctx, id);
    await markPayoutPaid(id, actorOf(ctx));
    revalidatePath("/admin/payouts");
    revalidatePath("/cleaner/earnings");
    return { ok: true, message: "Marked as paid." };
  } catch (e) {
    return fail(e);
  }
}

export async function cancelPayoutAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await adminCtx();
    await assertPayoutAccess(ctx, id);
    await cancelPayout(id, actorOf(ctx));
    revalidatePath("/admin/payouts");
    return { ok: true, message: "Payout cancelled; earnings released." };
  } catch (e) {
    return fail(e);
  }
}

// ── Series edits & price adjustment ────────────────────────────────────────

export async function previewSeriesEditAdminAction(
  bookingId: string,
  changes: SeriesChanges,
): Promise<{ ok: true; preview: SeriesEditPreview } | { ok: false; message: string }> {
  try {
    const ctx = await adminCtx();
    assertRegionAccess(
      ctx,
      (
        await prisma.booking.findUniqueOrThrow({
          where: { id: bookingId },
          select: { regionId: true },
        })
      ).regionId,
    );
    return { ok: true, preview: await previewSeriesEdit(bookingId, changes) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not preview" };
  }
}

export async function applySeriesEditAdminAction(
  bookingId: string,
  changes: SeriesChanges,
): Promise<ActionResult> {
  try {
    const ctx = await adminCtx();
    assertRegionAccess(
      ctx,
      (
        await prisma.booking.findUniqueOrThrow({
          where: { id: bookingId },
          select: { regionId: true },
        })
      ).regionId,
    );
    const res = await applySeriesEdit(bookingId, changes, actorOf(ctx));
    if (!res.ok) return res;
    revalidatePath(`/admin/bookings/${bookingId}`);
    revalidatePath("/admin/calendar");
    return {
      ok: true,
      message: res.regenerated
        ? `Series rescheduled: ${res.regenerated} visits regenerated.`
        : `Updated ${res.repriced} future visit${res.repriced === 1 ? "" : "s"}.`,
      warnings: res.assignmentsRemoved
        ? [
            `${res.assignmentsRemoved} cleaner assignment${res.assignmentsRemoved === 1 ? " was" : "s were"} removed and need re-dispatch.`,
          ]
        : [],
    };
  } catch (e) {
    return fail(e);
  }
}

export async function adjustJobPriceAction(
  jobId: string,
  deltaCents: number,
  note: string,
): Promise<ActionResult> {
  try {
    const ctx = await adminCtx();
    assertRegionAccess(
      ctx,
      (await prisma.job.findUniqueOrThrow({ where: { id: jobId }, select: { regionId: true } }))
        .regionId,
    );
    const res = await adjustJobPrice(jobId, deltaCents, note.trim(), actorOf(ctx));
    if (!res.ok) return res;
    revalidatePath(`/admin/jobs/${jobId}`);
    return { ok: true, message: `New total $${(res.totalCents / 100).toFixed(2)}.` };
  } catch (e) {
    return fail(e);
  }
}

// ── Time off ───────────────────────────────────────────────────────────────

export async function setTimeOffStatusAction(
  id: string,
  status: "APPROVED" | "DENIED",
): Promise<ActionResult> {
  try {
    const ctx = await adminCtx();
    const t = await prisma.timeOff.findUniqueOrThrow({ where: { id }, include: { cleaner: true } });
    assertRegionAccess(ctx, t.cleaner.homeRegionId);
    await prisma.timeOff.update({ where: { id }, data: { status } });
    const clashes =
      status === "APPROVED"
        ? await prisma.assignment.count({
            where: {
              cleanerId: t.cleanerId,
              status: { in: ["ACCEPTED", "OFFERED"] },
              job: {
                status: { in: ["CONFIRMED", "ASSIGNED"] },
                scheduledStartAt: { lte: t.endsAt },
                scheduledEndAt: { gte: t.startsAt },
              },
            },
          })
        : 0;
    const range = `${t.startsAt.toISOString().slice(0, 10)} to ${t.endsAt.toISOString().slice(0, 10)}`;
    const text = `Hi ${t.cleaner.firstName}, your time off request for ${range} was ${status === "APPROVED" ? "approved" : "declined"}.`;
    await notify(
      await cleanerTarget(t.cleanerId),
      "cleaner.timeoff",
      {
        subject: `Time off ${status === "APPROVED" ? "approved" : "declined"}: ${range}`,
        text: `${text} ${appUrl()}/cleaner/availability`,
        html: `<p>${text}</p><p>${brand()}</p>`,
        sms: `${brand()}: ${text}`,
      },
      `cleaner.timeoff:${id}:${status}`,
    );
    revalidatePath("/admin");
    revalidatePath(`/admin/cleaners/${t.cleanerId}`);
    return {
      ok: true,
      message: status === "APPROVED" ? "Time off approved." : "Request declined.",
      warnings: clashes
        ? [
            `${t.cleaner.firstName} has ${clashes} assigned job${clashes === 1 ? "" : "s"} in that range to reassign.`,
          ]
        : [],
    };
  } catch (e) {
    return fail(e);
  }
}
