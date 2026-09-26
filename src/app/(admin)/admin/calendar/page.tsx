import Link from "next/link";
import { DispatchCalendar } from "@/components/admin/dispatch-calendar";
import { Button, buttonVariants } from "@/components/ui/button";
import { loadCalendarData } from "@/modules/admin/calendar-data";
import { pickRegionForDate } from "@/modules/admin/regions";
import { requireRole } from "@/modules/auth/session";
import { addLocalDays, localDateToDateColumn, todayIn } from "@/modules/shared/dates";

export const dynamic = "force-dynamic";

export default async function CalendarPage({ searchParams }: PageProps<"/admin/calendar">) {
  const ctx = await requireRole("/admin/login", "SUPER_ADMIN", "REGION_ADMIN");
  const params = await searchParams;
  const requestedDate =
    typeof params.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : null;
  const { regions, region } = await pickRegionForDate(
    ctx,
    typeof params.region === "string" ? params.region : null,
    localDateToDateColumn(requestedDate ?? todayIn("America/Toronto")),
  );
  if (!region) return <p>No regions available.</p>;
  const today = todayIn(region.timezone);
  const date = requestedDate ?? today;
  const { resources, events } = await loadCalendarData(region.id, date);
  const href = (d: string, r = region.id) => `/admin/calendar?region=${r}&date=${d}`;
  const label = new Date(`${date}T00:00:00Z`).toLocaleDateString("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  const unassigned = events.filter((e) => e.resourceId === "unassigned").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dispatch</h1>
          <p className="text-sm text-muted-foreground">
            {label} · {events.length} job{events.length === 1 ? "" : "s"}
            {unassigned ? (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
                {unassigned} unassigned
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <form className="contents">
            <select
              name="region"
              defaultValue={region.id}
              className="h-8 rounded-lg border bg-background px-2 text-sm"
              onChange={undefined}
            >
              {regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}, {r.province}
                </option>
              ))}
            </select>
            <input type="hidden" name="date" value={date} />
            <Button type="submit" variant="outline" size="sm">
              Switch
            </Button>
          </form>
          <Link
            href={href(addLocalDays(date, -1))}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            ‹
          </Link>
          <Link href={href(today)} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Today
          </Link>
          <Link
            href={href(addLocalDays(date, 1))}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            ›
          </Link>
        </div>
      </div>
      <DispatchCalendar
        date={date}
        resources={resources}
        events={events}
        timezoneLabel={region.timezone.split("/")[1]?.replace("_", " ") ?? region.timezone}
      />
      <p className="text-xs text-muted-foreground">
        Drag a job between lanes to assign or unassign. Click a job to open it. Times are shown in
        the region&apos;s local time.
      </p>
    </div>
  );
}
