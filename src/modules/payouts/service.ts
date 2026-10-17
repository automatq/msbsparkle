import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/modules/db/client";
import type { Actor } from "@/modules/jobs/state-machine";

export const AUTO_APPROVE_AFTER_HOURS = 48;

type Scope = { regionIds: string[]; all: boolean };
const cleanerScope = (scope: Scope): Prisma.CleanerWhereInput =>
  scope.all ? {} : { homeRegionId: { in: scope.regionIds } };

export async function approveEarnings(ids: string[], actor: Actor): Promise<number> {
  const res = await prisma.cleanerEarning.updateMany({
    where: { id: { in: ids }, status: "PENDING" },
    data: { status: "APPROVED" },
  });
  if (res.count) await audit(actor, "earning.approve", ids.join(","), { count: res.count });
  return res.count;
}

export async function adjustEarning(
  id: string,
  adjustmentCents: number,
  actor: Actor,
): Promise<void> {
  const e = await prisma.cleanerEarning.findUniqueOrThrow({ where: { id } });
  if (e.status === "PAID" || e.status === "VOID")
    throw new Error("Paid or void earnings cannot be adjusted.");
  await prisma.cleanerEarning.update({
    where: { id },
    data: { adjustmentCents, totalCents: e.baseCents + e.tipCents + adjustmentCents },
  });
  await audit(actor, "earning.adjust", id, { from: e.adjustmentCents, to: adjustmentCents });
}

export async function voidEarning(id: string, actor: Actor): Promise<void> {
  const e = await prisma.cleanerEarning.findUniqueOrThrow({ where: { id } });
  if (e.status === "PAID") throw new Error("Already paid.");
  await prisma.cleanerEarning.update({ where: { id }, data: { status: "VOID", payoutId: null } });
  await audit(actor, "earning.void", id, {});
}

/** PENDING earnings older than the dispute window become APPROVED unless the job was refunded or disputed. */
export async function runEarningsAutoApprove(now = new Date()): Promise<{ approved: number }> {
  const cutoff = new Date(now.getTime() - AUTO_APPROVE_AFTER_HOURS * 3600_000);
  const res = await prisma.cleanerEarning.updateMany({
    where: {
      status: "PENDING",
      createdAt: { lte: cutoff },
      job: {
        paymentStatus: { notIn: ["REFUNDED", "PARTIALLY_REFUNDED"] },
        charges: { none: { status: "DISPUTED" } },
      },
    },
    data: { status: "APPROVED" },
  });
  return { approved: res.count };
}

export type PayoutPreviewRow = {
  cleanerId: string;
  name: string;
  email: string;
  region: string;
  earnings: number;
  jobs: number;
  baseCents: number;
  tipCents: number;
  adjustmentCents: number;
  totalCents: number;
};

/** APPROVED, unpaid earnings for jobs completed inside [periodStart, periodEnd], grouped by cleaner. */
export async function previewPayouts(
  scope: Scope,
  periodStart: Date,
  periodEnd: Date,
): Promise<PayoutPreviewRow[]> {
  const rows = await prisma.cleanerEarning.findMany({
    where: {
      status: "APPROVED",
      payoutId: null,
      cleaner: cleanerScope(scope),
      job: { completedAt: { gte: periodStart, lte: periodEnd } },
    },
    include: { cleaner: { include: { homeRegion: true } } },
  });
  const by = new Map<string, PayoutPreviewRow>();
  for (const e of rows) {
    const r = by.get(e.cleanerId) ?? {
      cleanerId: e.cleanerId,
      name: `${e.cleaner.firstName} ${e.cleaner.lastName}`,
      email: e.cleaner.email,
      region: e.cleaner.homeRegion.name,
      earnings: 0,
      jobs: 0,
      baseCents: 0,
      tipCents: 0,
      adjustmentCents: 0,
      totalCents: 0,
    };
    r.earnings += 1;
    r.jobs += 1;
    r.baseCents += e.baseCents;
    r.tipCents += e.tipCents;
    r.adjustmentCents += e.adjustmentCents;
    r.totalCents += e.totalCents;
    by.set(e.cleanerId, r);
  }
  return [...by.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Creates one PENDING payout per cleaner for the period and attaches the earnings. */
export async function createPayouts(
  scope: Scope,
  periodStart: Date,
  periodEnd: Date,
  actor: Actor,
): Promise<{ payouts: number; totalCents: number }> {
  const preview = await previewPayouts(scope, periodStart, periodEnd);
  let totalCents = 0;
  for (const row of preview) {
    await prisma.$transaction(async (tx) => {
      const earnings = await tx.cleanerEarning.findMany({
        where: {
          cleanerId: row.cleanerId,
          status: "APPROVED",
          payoutId: null,
          job: { completedAt: { gte: periodStart, lte: periodEnd } },
        },
      });
      if (!earnings.length) return;
      const total = earnings.reduce((s, e) => s + e.totalCents, 0);
      const payout = await tx.payout.create({
        data: {
          cleanerId: row.cleanerId,
          periodStart,
          periodEnd,
          totalCents: total,
          method: "MANUAL",
          status: "PENDING",
        },
      });
      await tx.cleanerEarning.updateMany({
        where: { id: { in: earnings.map((e) => e.id) } },
        data: { payoutId: payout.id },
      });
      totalCents += total;
    });
  }
  if (preview.length)
    await audit(
      actor,
      "payout.create_batch",
      `${periodStart.toISOString().slice(0, 10)}..${periodEnd.toISOString().slice(0, 10)}`,
      { payouts: preview.length, totalCents },
    );
  return { payouts: preview.length, totalCents };
}

export async function markPayoutPaid(payoutId: string, actor: Actor): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const p = await tx.payout.findUniqueOrThrow({ where: { id: payoutId } });
    if (p.status === "PAID") return;
    await tx.payout.update({
      where: { id: payoutId },
      data: { status: "PAID", paidAt: new Date() },
    });
    await tx.cleanerEarning.updateMany({ where: { payoutId }, data: { status: "PAID" } });
  });
  await audit(actor, "payout.mark_paid", payoutId, {});
}

/** Cancels an unpaid payout and releases its earnings back to APPROVED. */
export async function cancelPayout(payoutId: string, actor: Actor): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const p = await tx.payout.findUniqueOrThrow({ where: { id: payoutId } });
    if (p.status === "PAID") throw new Error("Paid payouts cannot be cancelled.");
    await tx.cleanerEarning.updateMany({ where: { payoutId }, data: { payoutId: null } });
    await tx.payout.delete({ where: { id: payoutId } });
  });
  await audit(actor, "payout.cancel", payoutId, {});
}

async function audit(actor: Actor, action: string, entityId: string, after: Prisma.InputJsonValue) {
  const org = await prisma.organization.findFirstOrThrow({ select: { id: true } });
  await prisma.auditLog.create({
    data: {
      organizationId: org.id,
      actorType: actor.type,
      actorId: actor.id ?? null,
      entityType: "Payout",
      entityId: entityId.slice(0, 190),
      action,
      after,
    },
  });
}

/** Last completed Monday–Sunday week before `today` (UTC date math on local dates). */
export function lastCompletedWeek(todayIso: string): { start: string; end: string } {
  const [y, m, d] = todayIso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  const dow = (t.getUTCDay() + 6) % 7; // Monday = 0
  const thisMonday = new Date(t.getTime() - dow * 86_400_000);
  const start = new Date(thisMonday.getTime() - 7 * 86_400_000);
  const end = new Date(thisMonday.getTime() - 86_400_000);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}
