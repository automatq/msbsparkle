import { Badge, Group, Paper, Stack, Text } from "@mantine/core";
import { DispatchCalendar } from "@/components/admin/dispatch-calendar";
import { DispatchToolbar } from "@/components/admin/mantine/dispatch-toolbar";
import { PageHeader } from "@/components/admin/mantine/page-header";
import { loadCalendarData } from "@/modules/admin/calendar-data";
import { pickRegionForDate } from "@/modules/admin/regions";
import { requireRole } from "@/modules/auth/session";
import { addLocalDays, localDateToDateColumn, todayIn } from "@/modules/shared/dates";
import { locale, timezone } from "@/modules/shared/country";

export const dynamic = "force-dynamic";

export default async function CalendarPage({ searchParams }: PageProps<"/admin/calendar">) {
  const ctx = await requireRole("/admin/login", "SUPER_ADMIN", "REGION_ADMIN");
  const params = await searchParams;
  const requestedDate =
    typeof params.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : null;
  const { regions, region } = await pickRegionForDate(
    ctx,
    typeof params.region === "string" ? params.region : null,
    localDateToDateColumn(requestedDate ?? todayIn(timezone)),
  );
  if (!region)
    return (
      <Stack>
        <PageHeader title="Dispatch" />
        <Text c="dimmed">No regions available.</Text>
      </Stack>
    );
  const today = todayIn(region.timezone);
  const date = requestedDate ?? today;
  const { resources, events } = await loadCalendarData(region.id, date);
  const label = new Date(`${date}T00:00:00Z`).toLocaleDateString(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  const unassigned = events.filter((e) => e.resourceId === "unassigned").length;

  return (
    <Stack gap="md">
      <PageHeader
        title="Dispatch"
        description={
          <Group component="span" gap={8} wrap="nowrap">
            <span>
              {label} · {region.name} · {events.length} job{events.length === 1 ? "" : "s"}
            </span>
            {unassigned ? (
              <Badge color="orange" variant="light" size="sm" data-testid="dispatch-unassigned">
                {unassigned} unassigned
              </Badge>
            ) : null}
          </Group>
        }
        actions={
          <DispatchToolbar
            regionId={region.id}
            regions={regions.map((r) => ({ id: r.id, label: `${r.name}, ${r.province}` }))}
            date={date}
            today={today}
            prev={addLocalDays(date, -1)}
            next={addLocalDays(date, 1)}
            unassigned={unassigned}
          />
        }
      />
      <Paper p="xs" style={{ overflowX: "auto" }}>
        <DispatchCalendar
          date={date}
          resources={resources}
          events={events}
          timezoneLabel={region.timezone.split("/")[1]?.replace("_", " ") ?? region.timezone}
        />
      </Paper>
      <Text size="xs" c="dimmed">
        Drag a job between lanes to assign or unassign. Click a job to open it. Times are shown in
        the region&apos;s local time.
      </Text>
    </Stack>
  );
}
