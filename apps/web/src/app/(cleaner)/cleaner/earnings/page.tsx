import Link from "next/link";
import { currentCleaner } from "@/modules/cleaner/current";
import { getEarnings } from "@/modules/cleaner/service";
import { dateColumnToLocalDate } from "@/modules/shared/dates";
import { formatCents } from "@/modules/shared/money";

export const dynamic = "force-dynamic";

export default async function EarningsPage() {
  const cleaner = await currentCleaner();
  if (!cleaner) return null;
  const { pay, weekCents, last30Cents, rows: earnings } = await getEarnings(cleaner);
  const basis =
    pay.payType === "PERCENT_OF_JOB"
      ? `${(pay.payPercentBps ?? 0) / 100}% of each job (pre-tax)`
      : pay.payType === "HOURLY"
        ? `${formatCents(pay.payRateCents ?? 0)}/hour on checked-in time`
        : `${formatCents(pay.payRateCents ?? 0)} per job`;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Earnings</h1>
        <p className="text-xs text-muted-foreground">Paid {basis}. Tips are passed through 100%.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border p-3">
          <p className="text-xs text-muted-foreground">This week</p>
          <p className="text-2xl font-semibold" data-testid="earnings-week">
            {formatCents(weekCents)}
          </p>
        </div>
        <div className="rounded-xl border p-3">
          <p className="text-xs text-muted-foreground">Last 30 days</p>
          <p className="text-2xl font-semibold">{formatCents(last30Cents)}</p>
        </div>
      </div>
      <ul className="space-y-2">
        {earnings.map((e) => (
          <li key={e.id} className="rounded-xl border p-3 text-sm">
            <div className="flex justify-between">
              <Link href={`/cleaner/jobs/${e.jobId}`} className="font-medium">
                {dateColumnToLocalDate(e.job.scheduledDate)} · {e.job.service.name}
              </Link>
              <span className="font-semibold">{formatCents(e.totalCents)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {e.job.customer.firstName} {e.job.customer.lastName[0]}. ·{" "}
              {e.job.booking.bookingNumber} · {e.basis.replaceAll("_", " ").toLowerCase()}
              {e.tipCents ? ` · tip ${formatCents(e.tipCents)}` : ""} · {e.status.toLowerCase()}
            </p>
          </li>
        ))}
        {earnings.length === 0 ? (
          <li className="text-sm text-muted-foreground">
            Complete your first job to see earnings here.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
