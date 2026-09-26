import type { Prisma } from "@/generated/prisma/client";
import { bpsOf } from "@/modules/shared/money";

type Tx = Prisma.TransactionClient;

/**
 * Creates the CleanerEarning for an accepted assignment on a completed job, using the
 * cleaner's pay type at completion time so later rate changes never rewrite history.
 */
export async function createEarningForAssignment(tx: Tx, assignmentId: string): Promise<void> {
  const a = await tx.assignment.findUniqueOrThrow({
    where: { id: assignmentId },
    include: {
      cleaner: true,
      job: {
        include: {
          activeQuote: true,
          assignments: { where: { status: "ACCEPTED" } },
          tips: { include: { splits: true } },
        },
      },
      earning: true,
    },
  });
  if (a.earning || a.status !== "ACCEPTED") return;
  const job = a.job;
  const cleaners = Math.max(1, job.assignments.length);
  let base = 0;
  switch (a.cleaner.payType) {
    case "HOURLY": {
      const start = a.checkInAt ?? job.actualStartAt ?? job.scheduledStartAt;
      const end = a.checkOutAt ?? job.actualEndAt ?? new Date();
      const minutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));
      base = Math.round(((a.cleaner.payRateCents ?? 0) * minutes) / 60);
      break;
    }
    case "PERCENT_OF_JOB": {
      const preTax = job.activeQuote?.taxableCents ?? 0;
      base = Math.round(bpsOf(preTax, a.cleaner.payPercentBps ?? 0) / cleaners);
      break;
    }
    case "FLAT_PER_JOB":
      base = a.cleaner.payRateCents ?? 0;
      break;
  }
  const tip = job.tips.reduce(
    (s, t) =>
      s +
      (t.splits.find((x) => x.cleanerId === a.cleanerId)?.amountCents ??
        (t.splits.length ? 0 : Math.round(t.amountCents / cleaners))),
    0,
  );
  await tx.cleanerEarning.create({
    data: {
      assignmentId: a.id,
      cleanerId: a.cleanerId,
      jobId: job.id,
      basis: a.cleaner.payType,
      baseCents: base,
      tipCents: tip,
      totalCents: base + tip,
    },
  });
}
