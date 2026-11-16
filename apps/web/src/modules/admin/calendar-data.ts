import { prisma } from "@/modules/db/client";
import { localDateToDateColumn, type LocalDate } from "@/modules/shared/dates";
import type { CalendarEvent, CalendarResource } from "@/components/admin/dispatch-calendar";

const STATUS_COLORS: Record<string, string> = {
  PENDING: "#d97706",
  CONFIRMED: "#0284c7",
  ASSIGNED: "#4f46e5",
  EN_ROUTE: "#7c3aed",
  IN_PROGRESS: "#2563eb",
  COMPLETED: "#059669",
  NO_SHOW: "#e11d48",
};

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = Math.min(h * 60 + m + minutes, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export async function loadCalendarData(
  regionId: string,
  date: LocalDate,
): Promise<{ resources: CalendarResource[]; events: CalendarEvent[] }> {
  const [cleaners, jobs] = await Promise.all([
    prisma.cleaner.findMany({
      where: {
        status: "ACTIVE",
        OR: [{ homeRegionId: regionId }, { regions: { some: { regionId } } }],
      },
      orderBy: [{ firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
    prisma.job.findMany({
      where: {
        regionId,
        scheduledDate: localDateToDateColumn(date),
        status: { notIn: ["CANCELLED", "SKIPPED"] },
      },
      include: {
        customer: { select: { firstName: true, lastName: true } },
        service: { select: { name: true } },
        booking: { select: { bookingNumber: true } },
        assignments: { where: { status: { in: ["ACCEPTED", "OFFERED"] } } },
      },
      orderBy: { windowStartLocal: "asc" },
    }),
  ]);
  const events: CalendarEvent[] = [];
  const perCleaner = new Map<string, number>();
  for (const j of jobs) {
    const cleanersOnJob = Math.max(1, j.hourlyCleaners ?? 1);
    const workEnd = addMinutes(j.windowStartLocal, Math.ceil(j.estimatedMinutes / cleanersOnJob));
    const end = workEnd > j.windowEndLocal ? workEnd : j.windowEndLocal;
    const base = {
      title: `${j.customer.firstName} ${j.customer.lastName[0]}. · ${j.service.name} · ${j.booking.bookingNumber}`,
      start: `${date}T${j.windowStartLocal}:00`,
      end: `${date}T${end}:00`,
      jobId: j.id,
      status: j.status,
      color: STATUS_COLORS[j.status] ?? "#6b7280",
    };
    if (j.assignments.length === 0) {
      events.push({ ...base, id: `${j.id}:u`, resourceId: "unassigned", cleanerId: null });
    } else {
      for (const a of j.assignments) {
        events.push({
          ...base,
          id: `${j.id}:${a.cleanerId}`,
          resourceId: a.cleanerId,
          cleanerId: a.cleanerId,
          title: a.status === "OFFERED" ? `(offered) ${base.title}` : base.title,
        });
        perCleaner.set(a.cleanerId, (perCleaner.get(a.cleanerId) ?? 0) + 1);
      }
    }
  }
  const resources: CalendarResource[] = [
    { id: "unassigned", title: "Unassigned" },
    ...cleaners.map((c) => ({
      id: c.id,
      title: `${c.firstName} ${c.lastName}`,
      jobsToday: perCleaner.get(c.id) ?? 0,
    })),
  ];
  return { resources, events };
}
