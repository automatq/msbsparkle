"use client";

import type { EventDropArg } from "@fullcalendar/core";
import interactionPlugin from "@fullcalendar/interaction";
import FullCalendar from "@fullcalendar/react";
import resourceTimelinePlugin from "@fullcalendar/resource-timeline";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { moveAssignmentAction } from "@/modules/admin/actions";

export const UNASSIGNED = "unassigned";

export type CalendarResource = { id: string; title: string; jobsToday?: number };
export type CalendarEvent = {
  id: string;
  resourceId: string;
  title: string;
  /** Wall-clock ISO without offset, e.g. "2026-09-28T08:00:00". Calendar runs in "UTC" so these display as-is. */
  start: string;
  end: string;
  jobId: string;
  status: string;
  cleanerId: string | null;
  color?: string;
};

const LICENSE =
  process.env.NEXT_PUBLIC_FULLCALENDAR_LICENSE_KEY ?? "CC-Attribution-NonCommercial-NoDerivatives";

export function DispatchCalendar({
  date,
  resources,
  events,
  timezoneLabel,
}: {
  date: string;
  resources: CalendarResource[];
  events: CalendarEvent[];
  timezoneLabel: string;
}) {
  const router = useRouter();
  const [, start] = useTransition();

  function onDrop(info: EventDropArg) {
    const to = info.newResource?.id ?? info.event.getResources()[0]?.id;
    const from = info.oldResource?.id ?? to;
    if (!to || to === from) return;
    const ext = info.event.extendedProps as { jobId: string; cleanerId: string | null };
    start(async () => {
      const res = await moveAssignmentAction(
        ext.jobId,
        from === UNASSIGNED ? null : from,
        to === UNASSIGNED ? null : to,
      );
      if (!res.ok) {
        info.revert();
        toast.error(res.message);
        return;
      }
      res.warnings?.forEach((w) => toast.warning(w));
      toast.success(to === UNASSIGNED ? "Unassigned" : "Assigned");
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border bg-background p-2 text-sm [&_.fc-license-message]:hidden">
      <FullCalendar
        plugins={[resourceTimelinePlugin, interactionPlugin]}
        schedulerLicenseKey={LICENSE}
        initialView="resourceTimelineDay"
        initialDate={date}
        timeZone="UTC"
        headerToolbar={false}
        height="auto"
        slotMinTime="07:00:00"
        slotMaxTime="20:00:00"
        slotDuration="00:30:00"
        slotLabelFormat={{ hour: "numeric", minute: "2-digit", hour12: true }}
        resourceAreaHeaderContent={`Cleaners (${timezoneLabel})`}
        resourceAreaWidth="220px"
        resourceOrder="order,title"
        resources={resources.map((r, i) => ({
          id: r.id,
          title: r.title,
          order: r.id === UNASSIGNED ? -1 : i,
          extendedProps: { jobsToday: r.jobsToday ?? 0 },
        }))}
        resourceLabelContent={(arg) => {
          const n = (arg.resource.extendedProps as { jobsToday: number }).jobsToday;
          return {
            html: `<div class="px-1"><div class="font-medium">${arg.resource.title}</div>${arg.resource.id === UNASSIGNED ? "" : `<div class="text-xs text-muted-foreground">${n} job${n === 1 ? "" : "s"} today</div>`}</div>`,
          };
        }}
        events={events.map((e) => ({
          id: e.id,
          resourceId: e.resourceId,
          title: e.title,
          start: e.start,
          end: e.end,
          backgroundColor: e.color,
          borderColor: e.color,
          extendedProps: { jobId: e.jobId, status: e.status, cleanerId: e.cleanerId },
        }))}
        editable
        eventStartEditable={false}
        eventDurationEditable={false}
        eventResourceEditable
        eventDrop={onDrop}
        eventClick={(info) => {
          info.jsEvent.preventDefault();
          router.push(`/admin/jobs/${(info.event.extendedProps as { jobId: string }).jobId}`);
        }}
        eventContent={(arg) => ({
          html: `<div class="truncate px-1 text-xs leading-tight"><b>${arg.timeText}</b> ${arg.event.title}</div>`,
        })}
        nowIndicator={false}
      />
    </div>
  );
}
