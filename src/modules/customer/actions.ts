"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCtx } from "@/modules/auth/session";
import {
  cancelBooking,
  cancelJob,
  isLateCancel,
  lateCancelFeeCents,
  pauseBooking,
  resumeBooking,
} from "@/modules/bookings/cancel";
import {
  applySeriesEdit,
  previewSeriesEdit,
  type SeriesChanges,
  type SeriesEditPreview,
} from "@/modules/bookings/edit-booking";
import { prisma } from "@/modules/db/client";
import type { Actor } from "@/modules/jobs/state-machine";
import { createSetupIntent, verifyAndAttachSetupIntent } from "@/modules/payments/setup-intents";
import { getStripe, isStripeConfigured } from "@/modules/payments/stripe";
import { rescheduleJob } from "@/modules/scheduling/assignment";
import { loadAvailability, type DayAvailability } from "@/modules/scheduling/availability";
import {
  addLocalDays,
  localDateToDateColumn,
  todayIn,
  zonedToInstant,
} from "@/modules/shared/dates";
import { customerForCtx, ownedBooking, ownedJob } from "./queries";

export type CustomerActionResult =
  { ok: true; message?: string; warnings?: string[] } | { ok: false; message: string };

async function me() {
  const ctx = await getCtx();
  const customer = await customerForCtx(ctx);
  return { ctx, customer, actor: { type: "CUSTOMER", id: customer.id } as Actor };
}
function fail(e: unknown): CustomerActionResult {
  console.error("[customer action]", e);
  return { ok: false, message: e instanceof Error ? e.message : "Something went wrong" };
}
function revalidate(bookingId?: string, jobId?: string) {
  revalidatePath("/account");
  if (bookingId) revalidatePath(`/account/bookings/${bookingId}`);
  if (jobId) revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath("/admin/calendar");
}

export async function visitAvailabilityAction(jobId: string): Promise<{ days: DayAvailability[] }> {
  const { customer } = await me();
  const job = await ownedJob(customer.id, jobId);
  if (!job) return { days: [] };
  const from = todayIn(job.timezone);
  return { days: await loadAvailability(job.regionId, from, addLocalDays(from, 28)) };
}

export async function rescheduleVisitAction(
  jobId: string,
  scheduledDate: string,
  windowId: string,
): Promise<CustomerActionResult> {
  try {
    const { customer, actor } = await me();
    const job = await ownedJob(customer.id, jobId);
    if (!job) return { ok: false, message: "Visit not found." };
    if (!["PENDING", "CONFIRMED", "ASSIGNED"].includes(job.status))
      return { ok: false, message: "This visit can no longer be changed online. Please call us." };
    const late = isLateCancel(job, job.region);
    const res = await rescheduleJob(
      { jobId, scheduledDate, windowId, actor },
      { loadAvailability, zonedToInstant, localDateToDateColumn },
    );
    if (!res.ok) return { ok: false, message: res.message };
    let message = "Visit rescheduled.";
    if (late) {
      const fee = lateCancelFeeCents(job.region, job.activeQuote?.totalCents ?? 0);
      if (fee > 0) {
        await prisma.charge.upsert({
          where: { idempotencyKey: `job:${jobId}:late-reschedule` },
          update: {},
          create: {
            organizationId: job.organizationId,
            customerId: customer.id,
            jobId,
            type: "CANCELLATION_FEE",
            amountCents: fee,
            cardCents: fee,
            paymentMethodId: job.booking.paymentMethodId,
            idempotencyKey: `job:${jobId}:late-reschedule`,
            status: "PENDING",
          },
        });
        message = `Visit rescheduled. A late-change fee of $${(fee / 100).toFixed(2)} applies.`;
      }
    }
    revalidate(job.bookingId, jobId);
    return { ok: true, message };
  } catch (e) {
    return fail(e);
  }
}

export async function cancelVisitAction(
  jobId: string,
  reason: string,
): Promise<CustomerActionResult> {
  try {
    const { customer, actor } = await me();
    const job = await ownedJob(customer.id, jobId);
    if (!job) return { ok: false, message: "Visit not found." };
    if (!["PENDING", "CONFIRMED", "ASSIGNED", "EN_ROUTE"].includes(job.status))
      return { ok: false, message: "This visit can no longer be cancelled online." };
    const res = await cancelJob(jobId, actor, {
      reason: reason || "customer cancelled",
      skip: job.booking.frequency !== "ONE_TIME" && !isLateCancel(job, job.region),
    });
    revalidate(job.bookingId, jobId);
    return {
      ok: true,
      message: res.feeCents
        ? `Cancelled. A late-cancellation fee of $${(res.feeCents / 100).toFixed(2)} applies.`
        : "Visit cancelled.",
    };
  } catch (e) {
    return fail(e);
  }
}

export async function cancelSeriesAction(
  bookingId: string,
  reason: string,
): Promise<CustomerActionResult> {
  try {
    const { customer, actor } = await me();
    const b = await ownedBooking(customer.id, bookingId);
    if (!b) return { ok: false, message: "Booking not found." };
    await cancelBooking(bookingId, actor, reason || "customer cancelled");
    revalidate(bookingId);
    return { ok: true, message: "All future visits cancelled." };
  } catch (e) {
    return fail(e);
  }
}

export async function pauseSeriesAction(
  bookingId: string,
  from: string,
  until: string,
): Promise<CustomerActionResult> {
  try {
    const { customer, actor } = await me();
    const b = await ownedBooking(customer.id, bookingId);
    if (!b) return { ok: false, message: "Booking not found." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(until) || until < from)
      return { ok: false, message: "Choose a valid date range." };
    await pauseBooking(bookingId, localDateToDateColumn(from), localDateToDateColumn(until), actor);
    revalidate(bookingId);
    return { ok: true, message: "Series paused." };
  } catch (e) {
    return fail(e);
  }
}

export async function resumeSeriesAction(bookingId: string): Promise<CustomerActionResult> {
  try {
    const { customer } = await me();
    const b = await ownedBooking(customer.id, bookingId);
    if (!b) return { ok: false, message: "Booking not found." };
    await resumeBooking(bookingId);
    revalidate(bookingId);
    return { ok: true, message: "Series resumed." };
  } catch (e) {
    return fail(e);
  }
}

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
  tipCents: z.number().int().min(0).max(50_000),
});

export async function rateVisitAction(
  jobId: string,
  raw: z.infer<typeof reviewSchema>,
): Promise<CustomerActionResult> {
  try {
    const { customer, actor } = await me();
    const d = reviewSchema.parse(raw);
    const job = await ownedJob(customer.id, jobId);
    if (!job) return { ok: false, message: "Visit not found." };
    if (job.status !== "COMPLETED")
      return { ok: false, message: "You can rate a visit once it's complete." };
    if (job.review) return { ok: false, message: "You already rated this visit." };
    const lead = job.assignments.find((a) => a.role === "LEAD") ?? job.assignments[0];
    await prisma.$transaction(async (tx) => {
      await tx.review.create({
        data: {
          jobId,
          customerId: customer.id,
          cleanerId: lead?.cleanerId ?? null,
          rating: d.rating,
          comment: d.comment || null,
          isPublic: d.rating >= 4,
        },
      });
      for (const a of job.assignments) {
        const agg = await tx.review.aggregate({
          where: { cleanerId: a.cleanerId },
          _avg: { rating: true },
          _count: { rating: true },
        });
        await tx.cleaner.update({
          where: { id: a.cleanerId },
          data: { ratingAvg: agg._avg.rating ?? null, ratingCount: agg._count.rating },
        });
      }
      if (d.tipCents > 0) {
        const tip = await tx.tip.create({
          data: { jobId, customerId: customer.id, amountCents: d.tipCents },
        });
        const n = Math.max(1, job.assignments.length);
        await tx.tipSplit.createMany({
          data: job.assignments.map((a) => ({
            tipId: tip.id,
            cleanerId: a.cleanerId,
            amountCents: Math.floor(d.tipCents / n),
          })),
        });
        // Not charged yet? Fold the tip into the service charge. Otherwise charge it separately.
        if (job.paymentStatus === "UNPAID" || job.paymentStatus === "FAILED") {
          await tx.job.update({
            where: { id: jobId },
            data: { tipCents: { increment: d.tipCents } },
          });
        } else {
          await tx.charge.create({
            data: {
              organizationId: job.organizationId,
              customerId: customer.id,
              jobId,
              type: "TIP",
              amountCents: d.tipCents,
              cardCents: d.tipCents,
              paymentMethodId: job.booking.paymentMethodId,
              idempotencyKey: `tip:${tip.id}`,
              status: "PENDING",
            },
          });
        }
        for (const a of job.assignments) {
          const e = await tx.cleanerEarning.findUnique({ where: { assignmentId: a.id } });
          if (e && e.status === "PENDING")
            await tx.cleanerEarning.update({
              where: { id: e.id },
              data: {
                tipCents: { increment: Math.floor(d.tipCents / n) },
                totalCents: { increment: Math.floor(d.tipCents / n) },
              },
            });
        }
      }
      await tx.jobEvent.create({
        data: {
          jobId,
          type: "NOTE",
          actorType: actor.type,
          actorId: actor.id ?? null,
          data: { review: d.rating, tipCents: d.tipCents },
        },
      });
    });
    if (d.tipCents > 0 && job.paymentStatus === "PAID") await collectTipNow(jobId);
    revalidate(job.bookingId, jobId);
    return {
      ok: true,
      message: d.tipCents ? "Thanks for the rating and the tip!" : "Thanks for the rating!",
    };
  } catch (e) {
    return fail(e);
  }
}

/** Charges a pending TIP charge off-session when Stripe is configured. */
async function collectTipNow(jobId: string) {
  const stripe = getStripe();
  const charge = await prisma.charge.findFirst({
    where: { jobId, type: "TIP", status: "PENDING" },
    include: { customer: true, paymentMethod: true },
  });
  if (!stripe || !charge || !charge.customer.stripeCustomerId || !charge.paymentMethod) return;
  try {
    const pi = await stripe.paymentIntents.create(
      {
        amount: charge.cardCents,
        currency: "cad",
        customer: charge.customer.stripeCustomerId,
        payment_method: charge.paymentMethod.stripePaymentMethodId,
        off_session: true,
        confirm: true,
        metadata: { chargeId: charge.id, jobId, kind: "TIP" },
      },
      { idempotencyKey: charge.idempotencyKey },
    );
    await prisma.charge.update({
      where: { id: charge.id },
      data: {
        stripePaymentIntentId: pi.id,
        status: pi.status === "succeeded" ? "CAPTURED" : "FAILED",
        capturedAt: pi.status === "succeeded" ? new Date() : null,
      },
    });
  } catch (e) {
    await prisma.charge.update({
      where: { id: charge.id },
      data: { status: "FAILED", failureMessage: e instanceof Error ? e.message : "tip failed" },
    });
  }
}

const profileSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  phone: z.string().trim().min(7).max(20),
  marketingOptIn: z.boolean(),
  smsOptOut: z.boolean(),
});

export async function updateProfileAction(
  raw: z.infer<typeof profileSchema>,
): Promise<CustomerActionResult> {
  try {
    const { customer } = await me();
    const d = profileSchema.parse(raw);
    await prisma.customer.update({ where: { id: customer.id }, data: d });
    revalidatePath("/account/settings");
    return { ok: true, message: "Saved." };
  } catch (e) {
    return fail(e);
  }
}

const addressNotesSchema = z.object({
  entryInstructions: z.string().trim().max(500),
  parkingInstructions: z.string().trim().max(300),
  pets: z.string().trim().max(200),
});

export async function updateAddressNotesAction(
  addressId: string,
  raw: z.infer<typeof addressNotesSchema>,
): Promise<CustomerActionResult> {
  try {
    const { customer } = await me();
    const d = addressNotesSchema.parse(raw);
    const a = await prisma.address.findUnique({ where: { id: addressId } });
    if (!a || a.customerId !== customer.id) return { ok: false, message: "Address not found." };
    await prisma.address.update({
      where: { id: addressId },
      data: {
        entryInstructions: d.entryInstructions || null,
        parkingInstructions: d.parkingInstructions || null,
        pets: d.pets || null,
      },
    });
    revalidatePath("/account/settings");
    return { ok: true, message: "Saved." };
  } catch (e) {
    return fail(e);
  }
}

// ── Cards ──────────────────────────────────────────────────────────────────

export async function startAddCardAction(): Promise<
  { ok: true; clientSecret: string } | { ok: false; message: string }
> {
  try {
    const { customer } = await me();
    if (!isStripeConfigured())
      return { ok: false, message: "Card payments are not configured in this environment." };
    let stripeCustomerId = customer.stripeCustomerId;
    if (!stripeCustomerId) {
      const sc = await getStripe()!.customers.create(
        {
          email: customer.email,
          name: `${customer.firstName} ${customer.lastName}`,
          metadata: { customerId: customer.id },
        },
        { idempotencyKey: `customer:${customer.id}` },
      );
      stripeCustomerId = sc.id;
      await prisma.customer.update({ where: { id: customer.id }, data: { stripeCustomerId } });
    }
    const si = await createSetupIntent(stripeCustomerId, customer.id);
    return { ok: true, clientSecret: si.clientSecret };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not start card setup." };
  }
}

export async function finishAddCardAction(setupIntentId: string): Promise<CustomerActionResult> {
  try {
    const { customer } = await me();
    const pm = await verifyAndAttachSetupIntent(setupIntentId, customer.id);
    // Point active bookings at the new default card.
    await prisma.booking.updateMany({
      where: { customerId: customer.id, status: { in: ["ACTIVE", "PAUSED", "PENDING"] } },
      data: { paymentMethodId: pm.id },
    });
    revalidatePath("/account/payment");
    return { ok: true, message: "Card saved and set as default." };
  } catch (e) {
    return fail(e);
  }
}

export async function setDefaultCardAction(paymentMethodId: string): Promise<CustomerActionResult> {
  try {
    const { customer } = await me();
    const pm = await prisma.paymentMethod.findUnique({ where: { id: paymentMethodId } });
    if (!pm || pm.customerId !== customer.id) return { ok: false, message: "Card not found." };
    await prisma.$transaction([
      prisma.customer.update({
        where: { id: customer.id },
        data: { defaultPaymentMethodId: pm.id },
      }),
      prisma.booking.updateMany({
        where: { customerId: customer.id, status: { in: ["ACTIVE", "PAUSED", "PENDING"] } },
        data: { paymentMethodId: pm.id },
      }),
    ]);
    const stripe = getStripe();
    if (stripe && customer.stripeCustomerId)
      await stripe.customers.update(customer.stripeCustomerId, {
        invoice_settings: { default_payment_method: pm.stripePaymentMethodId },
      });
    revalidatePath("/account/payment");
    return { ok: true, message: "Default card updated." };
  } catch (e) {
    return fail(e);
  }
}

// ── Plan changes ("this and all future visits") ─────────────────────────────

export async function previewPlanEditAction(
  bookingId: string,
  changes: SeriesChanges,
): Promise<{ ok: true; preview: SeriesEditPreview } | { ok: false; message: string }> {
  try {
    const { customer } = await me();
    if (!(await ownedBooking(customer.id, bookingId)))
      return { ok: false, message: "Booking not found." };
    return { ok: true, preview: await previewSeriesEdit(bookingId, changes) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not preview" };
  }
}

export async function applyPlanEditAction(
  bookingId: string,
  changes: SeriesChanges,
): Promise<CustomerActionResult> {
  try {
    const { customer, actor } = await me();
    if (!(await ownedBooking(customer.id, bookingId)))
      return { ok: false, message: "Booking not found." };
    const res = await applySeriesEdit(bookingId, changes, actor);
    if (!res.ok) return res;
    revalidate(bookingId);
    return {
      ok: true,
      message: res.regenerated
        ? "Your plan was updated and upcoming visits rescheduled."
        : "Your plan was updated for all upcoming visits.",
    };
  } catch (e) {
    return fail(e);
  }
}
