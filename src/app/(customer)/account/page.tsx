import Link from "next/link";
import { StatusBadge } from "@/components/admin/ui";
import { CancelVisitButton, RatePanel, ReschedulePanel } from "@/components/customer/panels";
import { buttonVariants } from "@/components/ui/button";
import { requireRole } from "@/modules/auth/session";
import { isLateCancel, lateCancelFeeCents } from "@/modules/bookings/cancel";
import { customerForCtx } from "@/modules/customer/queries";
import { prisma } from "@/modules/db/client";
import { formatInZone } from "@/modules/shared/dates";
import { formatCents } from "@/modules/shared/money";

export const dynamic = "force-dynamic";

const FREQ: Record<string, string> = {
  ONE_TIME: "One-time",
  WEEKLY: "Weekly",
  BIWEEKLY: "Every 2 weeks",
  EVERY_4_WEEKS: "Every 4 weeks",
};

export default async function AccountHome() {
  const ctx = await requireRole("/login");
  const customer = await customerForCtx(ctx);
  const jobs = await prisma.job.findMany({
    where: { customerId: customer.id, status: { notIn: ["CANCELLED", "SKIPPED"] } },
    include: {
      booking: { include: { service: true, window: true, address: true } },
      region: true,
      activeQuote: true,
      review: true,
      assignments: { where: { status: "ACCEPTED" }, include: { cleaner: true } },
    },
    orderBy: { scheduledStartAt: "asc" },
  });
  const { upcoming, past } = splitVisits(jobs);
  const series = await prisma.booking.findMany({
    where: {
      customerId: customer.id,
      status: { in: ["ACTIVE", "PAUSED"] },
      frequency: { not: "ONE_TIME" },
    },
    include: { service: true, window: true },
  });

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Hi {customer.firstName}</h1>
        <Link href="/account/rebook" className={buttonVariants({ size: "sm" })}>
          Book another clean
        </Link>
      </div>

      {series.length ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">Your recurring plans</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {series.map((b) => (
              <li key={b.id} className="rounded-xl border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{b.service.name}</span>
                  <StatusBadge status={b.status} />
                </div>
                <p className="text-muted-foreground">
                  {FREQ[b.frequency]} · {b.window.label}
                </p>
                <Link href={`/account/bookings/${b.id}`} className="text-xs underline">
                  Manage plan
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Upcoming visits</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No upcoming visits.{" "}
            <Link href="/account/rebook" className="underline">
              Book one
            </Link>
            .
          </p>
        ) : null}
        {upcoming.map((j) => {
          const late = isLateCancel(j, j.region);
          const fee = lateCancelFeeCents(j.region, j.activeQuote?.totalCents ?? 0);
          const recurring = j.booking.frequency !== "ONE_TIME";
          return (
            <div key={j.id} className="rounded-xl border p-4 text-sm" data-testid={`visit-${j.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {formatInZone(j.scheduledStartAt, j.timezone, "EEEE, MMMM d")} ·{" "}
                    {j.booking.window.label}
                  </p>
                  <p className="text-muted-foreground">
                    {j.booking.service.name}
                    {j.isFirstCleanUpgrade ? " · first-clean upgrade" : ""} ·{" "}
                    {j.booking.address.line1}
                  </p>
                  <p className="text-muted-foreground">
                    {j.assignments.length
                      ? `Cleaner: ${j.assignments.map((a) => a.cleaner.firstName).join(", ")}`
                      : "Cleaner assigned closer to the date"}{" "}
                    ·{" "}
                    <Link href={`/account/bookings/${j.bookingId}`} className="underline">
                      {j.booking.bookingNumber}
                    </Link>
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatCents(j.activeQuote?.totalCents ?? 0)}</p>
                  <StatusBadge status={j.status} />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {["PENDING", "CONFIRMED", "ASSIGNED"].includes(j.status) ? (
                  <ReschedulePanel jobId={j.id} late={late} feeCents={fee} />
                ) : null}
                {["PENDING", "CONFIRMED", "ASSIGNED", "EN_ROUTE"].includes(j.status) ? (
                  <CancelVisitButton
                    jobId={j.id}
                    late={late}
                    feeCents={fee}
                    recurring={recurring}
                  />
                ) : null}
              </div>
            </div>
          );
        })}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Past visits</h2>
        {past.length === 0 ? (
          <p className="text-sm text-muted-foreground">No past visits yet.</p>
        ) : null}
        {past.map((j) => (
          <div key={j.id} className="rounded-xl border p-4 text-sm" data-testid={`visit-${j.id}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium">
                  {formatInZone(j.scheduledStartAt, j.timezone, "EEEE, MMMM d")} ·{" "}
                  {j.booking.service.name}
                </p>
                <p className="text-muted-foreground">
                  {j.assignments.map((a) => a.cleaner.firstName).join(", ") || "—"} ·{" "}
                  {j.booking.bookingNumber}
                  {j.review ? ` · you rated ${"★".repeat(j.review.rating)}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold">
                  {formatCents((j.activeQuote?.totalCents ?? 0) + j.tipCents)}
                </p>
                <StatusBadge status={j.paymentStatus === "PAID" ? "PAID" : j.status} />
              </div>
            </div>
            {j.status === "COMPLETED" && !j.review ? (
              <div className="mt-3">
                <RatePanel jobId={j.id} cleanerName={j.assignments[0]?.cleaner.firstName ?? null} />
              </div>
            ) : null}
          </div>
        ))}
      </section>
    </div>
  );
}

function splitVisits<T extends { status: string; scheduledEndAt: Date }>(
  jobs: T[],
): { upcoming: T[]; past: T[] } {
  const now = Date.now();
  const upcoming = jobs.filter(
    (j) =>
      !["COMPLETED", "NO_SHOW"].includes(j.status) &&
      j.scheduledEndAt.getTime() >= now - 6 * 3600_000,
  );
  const past = jobs
    .filter((j) => !upcoming.includes(j))
    .reverse()
    .slice(0, 12);
  return { upcoming, past };
}
