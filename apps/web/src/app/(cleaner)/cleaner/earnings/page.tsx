import Link from "next/link";
import { requireRole } from "@/modules/auth/session";
import { cleanerForUser } from "@/modules/cleaner/queries";
import { prisma } from "@/modules/db/client";
import { addLocalDays, dateColumnToLocalDate, todayIn } from "@/modules/shared/dates";
import { formatCents } from "@/modules/shared/money";

export const dynamic = "force-dynamic";

export default async function EarningsPage() {
  const ctx = await requireRole("/login/phone", "CLEANER", "SUPER_ADMIN");
  const cleaner = await cleanerForUser(ctx.userId);
  if (!cleaner) return null;
  const today = todayIn(cleaner.homeRegion.timezone);
  const weekStart = addLocalDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
  const earnings = await prisma.cleanerEarning.findMany({
    where: { cleanerId: cleaner.id },
    include: { job: { include: { customer: true, service: true, booking: true } } },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
  // Bucket by when the job was completed (earning creation), not when it was scheduled.
  const inRange = (from: string) =>
    earnings.filter((e) => {
      const d = dateColumnToLocalDate(e.createdAt);
      return d >= from && d <= today;
    });
  const sum = (rows: typeof earnings) => rows.reduce((s, e) => s + e.totalCents, 0);
  const basis =
    cleaner.payType === "PERCENT_OF_JOB"
      ? `${(cleaner.payPercentBps ?? 0) / 100}% of each job (pre-tax)`
      : cleaner.payType === "HOURLY"
        ? `${formatCents(cleaner.payRateCents ?? 0)}/hour on checked-in time`
        : `${formatCents(cleaner.payRateCents ?? 0)} per job`;
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
            {formatCents(sum(inRange(weekStart)))}
          </p>
        </div>
        <div className="rounded-xl border p-3">
          <p className="text-xs text-muted-foreground">Last 30 days</p>
          <p className="text-2xl font-semibold">
            {formatCents(sum(inRange(addLocalDays(today, -30))))}
          </p>
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
