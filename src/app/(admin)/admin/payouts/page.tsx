import Link from "next/link";
import {
  ApproveButton,
  CreatePayoutsForm,
  EarningRowActions,
  PayoutRowActions,
} from "@/components/admin/payout-panels";
import { StatusBadge } from "@/components/admin/ui";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireRole } from "@/modules/auth/session";
import { prisma } from "@/modules/db/client";
import {
  AUTO_APPROVE_AFTER_HOURS,
  lastCompletedWeek,
  previewPayouts,
} from "@/modules/payouts/service";
import { dateColumnToLocalDate, todayIn } from "@/modules/shared/dates";
import { formatCents } from "@/modules/shared/money";

export const dynamic = "force-dynamic";

export default async function PayoutsPage({ searchParams }: PageProps<"/admin/payouts">) {
  const ctx = await requireRole("/admin/login", "SUPER_ADMIN", "REGION_ADMIN");
  const p = await searchParams;
  const week = lastCompletedWeek(todayIn("America/Toronto"));
  const start = typeof p.start === "string" ? p.start : week.start;
  const end = typeof p.end === "string" ? p.end : todayIn("America/Toronto");
  const cleanerWhere = ctx.isSuperAdmin ? {} : { homeRegionId: { in: ctx.regionIds } };
  const [pending, ready, payouts] = await Promise.all([
    prisma.cleanerEarning.findMany({
      where: { status: "PENDING", cleaner: cleanerWhere },
      include: { cleaner: true, job: { include: { booking: true, service: true } } },
      orderBy: { createdAt: "asc" },
      take: 200,
    }),
    previewPayouts(
      { regionIds: ctx.regionIds, all: ctx.isSuperAdmin },
      new Date(`${start}T00:00:00Z`),
      new Date(`${end}T23:59:59Z`),
    ),
    prisma.payout.findMany({
      where: { cleaner: cleanerWhere },
      include: { cleaner: true, _count: { select: { earnings: true } } },
      orderBy: { createdAt: "desc" },
      take: 60,
    }),
  ]);
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Cleaner payouts</h1>
        <p className="text-sm text-muted-foreground">
          Earnings are created when a job is completed, approved here (or automatically after{" "}
          {AUTO_APPROVE_AFTER_HOURS} hours with no refund or dispute), then batched into payouts.
          Payouts are manual: send the money, then mark paid.
        </p>
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">1. Earnings to approve ({pending.length})</h2>
          {pending.length ? (
            <ApproveButton ids={pending.map((e) => e.id)} label={`Approve all ${pending.length}`} />
          ) : null}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Job</TableHead>
              <TableHead>Cleaner</TableHead>
              <TableHead>Basis</TableHead>
              <TableHead className="text-right">Base</TableHead>
              <TableHead className="text-right">Tip</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Adjust ($) / approve</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pending.map((e) => (
              <TableRow key={e.id}>
                <TableCell>
                  <Link href={`/admin/jobs/${e.jobId}`} className="hover:underline">
                    {dateColumnToLocalDate(e.job.scheduledDate)} · {e.job.booking.bookingNumber}
                  </Link>
                  <div className="text-xs text-muted-foreground">{e.job.service.name}</div>
                </TableCell>
                <TableCell>
                  {e.cleaner.firstName} {e.cleaner.lastName}
                </TableCell>
                <TableCell className="text-xs">
                  {e.basis.replaceAll("_", " ").toLowerCase()}
                </TableCell>
                <TableCell className="text-right">{formatCents(e.baseCents)}</TableCell>
                <TableCell className="text-right">{formatCents(e.tipCents)}</TableCell>
                <TableCell className="text-right font-medium">
                  {formatCents(e.totalCents)}
                </TableCell>
                <TableCell>
                  <EarningRowActions id={e.id} adjustmentCents={e.adjustmentCents} />
                </TableCell>
              </TableRow>
            ))}
            {pending.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  Nothing waiting for approval.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">2. Ready to pay</h2>
        <form className="flex flex-wrap items-end gap-2 text-sm">
          <label className="flex flex-col gap-1">
            Completed from
            <input
              type="date"
              name="start"
              defaultValue={start}
              className="h-8 rounded-lg border px-2"
            />
          </label>
          <label className="flex flex-col gap-1">
            to
            <input
              type="date"
              name="end"
              defaultValue={end}
              className="h-8 rounded-lg border px-2"
            />
          </label>
          <button type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Preview
          </button>
        </form>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cleaner</TableHead>
              <TableHead>Region</TableHead>
              <TableHead className="text-right">Jobs</TableHead>
              <TableHead className="text-right">Base</TableHead>
              <TableHead className="text-right">Tips</TableHead>
              <TableHead className="text-right">Adjustments</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ready.map((r) => (
              <TableRow key={r.cleanerId}>
                <TableCell>
                  {r.name}
                  <div className="text-xs text-muted-foreground">{r.email}</div>
                </TableCell>
                <TableCell>{r.region}</TableCell>
                <TableCell className="text-right">{r.jobs}</TableCell>
                <TableCell className="text-right">{formatCents(r.baseCents)}</TableCell>
                <TableCell className="text-right">{formatCents(r.tipCents)}</TableCell>
                <TableCell className="text-right">{formatCents(r.adjustmentCents)}</TableCell>
                <TableCell className="text-right font-medium">
                  {formatCents(r.totalCents)}
                </TableCell>
              </TableRow>
            ))}
            {ready.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No approved, unpaid earnings in this period.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
        {ready.length ? <CreatePayoutsForm start={start} end={end} /> : null}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">3. Payouts</h2>
          <Link
            href={`/admin/payouts/export.csv?start=${start}&end=${end}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Export CSV
          </Link>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Created</TableHead>
              <TableHead>Cleaner</TableHead>
              <TableHead>Period</TableHead>
              <TableHead className="text-right">Jobs</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payouts.map((po) => (
              <TableRow key={po.id}>
                <TableCell>{po.createdAt.toISOString().slice(0, 10)}</TableCell>
                <TableCell>
                  {po.cleaner.firstName} {po.cleaner.lastName}
                </TableCell>
                <TableCell className="text-xs">
                  {dateColumnToLocalDate(po.periodStart)} → {dateColumnToLocalDate(po.periodEnd)}
                </TableCell>
                <TableCell className="text-right">{po._count.earnings}</TableCell>
                <TableCell className="text-right font-medium">
                  {formatCents(po.totalCents)}
                </TableCell>
                <TableCell>
                  <StatusBadge status={po.status} />
                  {po.paidAt ? (
                    <span className="ml-1 text-xs text-muted-foreground">
                      {po.paidAt.toISOString().slice(0, 10)}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell>
                  <PayoutRowActions id={po.id} status={po.status} />
                </TableCell>
              </TableRow>
            ))}
            {payouts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No payouts yet.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
