import { prisma } from "@/modules/db/client";
import type { Actor } from "@/modules/jobs/state-machine";
import { transitionJob } from "@/modules/jobs/state-machine";
import { bpsOf } from "@/modules/shared/money";

export function lateCancelFeeCents(
  region: { lateCancelFeeType: "FIXED" | "PERCENT"; lateCancelFeeValue: number },
  jobTotalCents: number,
): number {
  return region.lateCancelFeeType === "FIXED"
    ? region.lateCancelFeeValue
    : bpsOf(jobTotalCents, region.lateCancelFeeValue);
}

export function isLateCancel(
  job: { scheduledStartAt: Date },
  region: { lateCancelWindowHours: number },
  now = new Date(),
): boolean {
  return job.scheduledStartAt.getTime() - now.getTime() < region.lateCancelWindowHours * 3600_000;
}

/**
 * Cancels a single job. Customers inside the late window incur the region fee (recorded as a
 * pending CANCELLATION_FEE charge, collected by the payments module). Admins may waive it.
 */
export async function cancelJob(
  jobId: string,
  actor: Actor,
  opts: { reason?: string; waiveFee?: boolean; skip?: boolean } = {},
) {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: { region: true, activeQuote: true, booking: true },
  });
  const late = isLateCancel(job, job.region);
  const chargeFee =
    late && !opts.skip && !opts.waiveFee && (actor.type === "CUSTOMER" || actor.type === "ADMIN");
  const feeCents = chargeFee ? lateCancelFeeCents(job.region, job.activeQuote?.totalCents ?? 0) : 0;
  await prisma.$transaction(async (tx) => {
    await transitionJob(tx, jobId, opts.skip ? "SKIPPED" : "CANCELLED", actor, {
      cancellationType: late && !opts.skip ? "LATE" : "FREE",
      reason: opts.reason ?? null,
      feeCents,
    });
    await tx.assignment.updateMany({
      where: { jobId, status: { in: ["OFFERED", "ACCEPTED"] } },
      data: { status: "REMOVED", removedReason: "JOB_CANCELLED" },
    });
    if (feeCents > 0) {
      await tx.charge.create({
        data: {
          organizationId: job.organizationId,
          customerId: job.customerId,
          jobId,
          type: "CANCELLATION_FEE",
          amountCents: feeCents,
          cardCents: feeCents,
          paymentMethodId: job.booking.paymentMethodId,
          idempotencyKey: `job:${jobId}:cancel-fee`,
          status: "PENDING",
        },
      });
    }
    if (job.booking.frequency === "ONE_TIME")
      await tx.booking.update({
        where: { id: job.bookingId },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancellationReason: opts.reason ?? null,
        },
      });
  });
  return { late, feeCents };
}

/** Cancels the whole series: ends the booking today and cancels every unstarted job. */
export async function cancelBooking(bookingId: string, actor: Actor, reason?: string) {
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: {
      jobs: { where: { status: { in: ["PENDING", "CONFIRMED", "ASSIGNED", "EN_ROUTE"] } } },
    },
  });
  for (const job of booking.jobs)
    await cancelJob(job.id, actor, { reason, waiveFee: actor.type === "ADMIN" });
  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancellationReason: reason ?? null,
      endsOn: new Date(),
    },
  });
}

export async function pauseBooking(bookingId: string, from: Date, until: Date, actor: Actor) {
  await prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: bookingId },
      data: { status: "PAUSED", pausedFrom: from, pausedUntil: until },
    });
    const jobs = await tx.job.findMany({
      where: {
        bookingId,
        status: { in: ["PENDING", "CONFIRMED", "ASSIGNED"] },
        scheduledDate: { gte: from, lte: until },
      },
    });
    for (const j of jobs) {
      await transitionJob(tx, j.id, "SKIPPED", actor, { reason: "booking paused" });
      await tx.assignment.updateMany({
        where: { jobId: j.id, status: { in: ["OFFERED", "ACCEPTED"] } },
        data: { status: "REMOVED", removedReason: "BOOKING_PAUSED" },
      });
    }
  });
}

export async function resumeBooking(bookingId: string) {
  await prisma.booking.update({
    where: { id: bookingId },
    data: { status: "ACTIVE", pausedFrom: null, pausedUntil: null },
  });
}
