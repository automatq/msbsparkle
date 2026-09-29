import Link from "next/link";
import { StatusBadge } from "@/components/admin/ui";
import { requireRole } from "@/modules/auth/session";
import { cleanerForUser, cleanerJobs } from "@/modules/cleaner/queries";
import {
  addLocalDays,
  dateColumnToLocalDate,
  formatInZone,
  localDateToDateColumn,
  todayIn,
} from "@/modules/shared/dates";

export const dynamic = "force-dynamic";

export default async function CleanerHome() {
  const ctx = await requireRole("/login/phone", "CLEANER", "SUPER_ADMIN");
  const cleaner = await cleanerForUser(ctx.userId);
  if (!cleaner)
    return (
      <p className="text-sm text-destructive">
        No cleaner profile is linked to this login. Ask your dispatcher.
      </p>
    );
  const today = todayIn(cleaner.homeRegion.timezone);
  const rows = await cleanerJobs(
    cleaner.id,
    localDateToDateColumn(addLocalDays(today, -1)),
    localDateToDateColumn(addLocalDays(today, 14)),
  );
  const offers = rows.filter((a) => a.status === "OFFERED");
  const todays = rows.filter(
    (a) => a.status === "ACCEPTED" && dateColumnToLocalDate(a.job.scheduledDate) === today,
  );
  const isOpen = (a: (typeof rows)[number]) => !["COMPLETED", "NO_SHOW"].includes(a.job.status);
  const upcoming = rows.filter(
    (a) =>
      a.status === "ACCEPTED" && isOpen(a) && dateColumnToLocalDate(a.job.scheduledDate) > today,
  );
  const recent = rows
    .filter((a) => a.status === "ACCEPTED" && !isOpen(a))
    .slice(-5)
    .reverse();

  const Item = ({ a }: { a: (typeof rows)[number] }) => {
    const addr = a.job.addressSnapshot as { line1: string; city: string };
    return (
      <li>
        <Link
          href={`/cleaner/jobs/${a.jobId}`}
          className="block rounded-xl border p-3 active:bg-muted/40"
        >
          <div className="flex items-center justify-between">
            <span className="font-medium">
              {a.job.windowStartLocal}–{a.job.windowEndLocal} ·{" "}
              {formatInZone(a.job.scheduledStartAt, a.job.timezone, "EEE MMM d")}
            </span>
            <StatusBadge status={a.status === "OFFERED" ? "PENDING" : a.job.status} />
          </div>
          <p className="text-sm">
            {a.job.service.name} · {a.job.customer.firstName} {a.job.customer.lastName[0]}.
          </p>
          <p className="text-xs text-muted-foreground">
            {addr.line1}, {addr.city} · ~{Math.round((a.job.estimatedMinutes / 60) * 10) / 10}h
          </p>
        </Link>
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Hi {cleaner.firstName}</h1>
        <p className="text-sm text-muted-foreground">
          {new Date(`${today}T00:00:00Z`).toLocaleDateString("en-CA", {
            weekday: "long",
            month: "long",
            day: "numeric",
            timeZone: "UTC",
          })}
        </p>
      </div>
      {offers.length ? (
        <section>
          <h2 className="mb-2 text-sm font-medium text-amber-800">New offers ({offers.length})</h2>
          <ul className="space-y-2">
            {offers.map((a) => (
              <Item key={a.id} a={a} />
            ))}
          </ul>
        </section>
      ) : null}
      <section>
        <h2 className="mb-2 text-sm font-medium">Today ({todays.length})</h2>
        {todays.length ? (
          <ul className="space-y-2">
            {todays.map((a) => (
              <Item key={a.id} a={a} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing scheduled today.</p>
        )}
      </section>
      <section>
        <h2 className="mb-2 text-sm font-medium">Upcoming</h2>
        {upcoming.length ? (
          <ul className="space-y-2">
            {upcoming.map((a) => (
              <Item key={a.id} a={a} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No upcoming jobs in the next two weeks.</p>
        )}
      </section>
      {recent.length ? (
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Recently completed</h2>
          <ul className="space-y-2">
            {recent.map((a) => (
              <Item key={a.id} a={a} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
