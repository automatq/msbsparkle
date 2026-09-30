import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/modules/db/client";
import { cleanupTestCustomer, seedTestBooking } from "@/modules/testing/fixtures";
import {
  approveEarnings,
  cancelPayout,
  createPayouts,
  markPayoutPaid,
  previewPayouts,
  runEarningsAutoApprove,
} from "./service";

const created: string[] = [];
const actor = { type: "ADMIN" as const, id: null };
const all = { regionIds: [], all: true };

async function completedJobWithEarning(totalCents: number) {
  const { job, customer } = await seedTestBooking({ startInHours: 2 });
  created.push(customer.id);
  const cleaner = await prisma.cleaner.findFirstOrThrow({ where: { firstName: "Priya" } });
  const completedAt = new Date();
  await prisma.job.update({ where: { id: job.id }, data: { status: "COMPLETED", completedAt } });
  const a = await prisma.assignment.create({
    data: { jobId: job.id, cleanerId: cleaner.id, status: "ACCEPTED", role: "LEAD" },
  });
  const e = await prisma.cleanerEarning.create({
    data: {
      assignmentId: a.id,
      cleanerId: cleaner.id,
      jobId: job.id,
      basis: "FLAT_PER_JOB",
      baseCents: totalCents,
      totalCents,
    },
  });
  return { job, cleaner, earning: e, completedAt };
}

describe.skipIf(!process.env.DATABASE_URL)("payouts (integration)", () => {
  afterAll(async () => {
    await prisma.payout.deleteMany({ where: { earnings: { none: {} } } });
    for (const id of created) await cleanupTestCustomer(id);
    await prisma.payout.deleteMany({ where: { earnings: { none: {} } } });
  });

  it("approve -> preview -> create payout -> mark paid", async () => {
    const { cleaner, earning, completedAt } = await completedJobWithEarning(9000);
    const start = new Date(completedAt.getTime() - 3600_000);
    const end = new Date(completedAt.getTime() + 3600_000);
    expect(
      (await previewPayouts(all, start, end)).find((r) => r.cleanerId === cleaner.id),
    ).toBeUndefined();
    expect(await approveEarnings([earning.id], actor)).toBe(1);
    const row = (await previewPayouts(all, start, end)).find((r) => r.cleanerId === cleaner.id)!;
    expect(row.totalCents).toBeGreaterThanOrEqual(9000);

    const res = await createPayouts(all, start, end, actor);
    expect(res.payouts).toBeGreaterThanOrEqual(1);
    const linked = await prisma.cleanerEarning.findUniqueOrThrow({
      where: { id: earning.id },
      include: { payout: true },
    });
    expect(linked.payout?.status).toBe("PENDING");
    // Already batched earnings are not offered again.
    expect(
      (await previewPayouts(all, start, end)).find((r) => r.cleanerId === cleaner.id),
    ).toBeUndefined();

    await markPayoutPaid(linked.payoutId!, actor);
    const paid = await prisma.cleanerEarning.findUniqueOrThrow({
      where: { id: earning.id },
      include: { payout: true },
    });
    expect(paid.status).toBe("PAID");
    expect(paid.payout?.paidAt).not.toBeNull();
    await expect(cancelPayout(linked.payoutId!, actor)).rejects.toThrow(/cannot be cancelled/);
  });

  it("auto-approves pending earnings after the dispute window only", async () => {
    const { earning } = await completedJobWithEarning(5000);
    await runEarningsAutoApprove(new Date());
    expect(
      (await prisma.cleanerEarning.findUniqueOrThrow({ where: { id: earning.id } })).status,
    ).toBe("PENDING");
    await runEarningsAutoApprove(new Date(Date.now() + 49 * 3600_000));
    expect(
      (await prisma.cleanerEarning.findUniqueOrThrow({ where: { id: earning.id } })).status,
    ).toBe("APPROVED");
  });
});
