import { prisma } from "@/modules/db/client";
import {
  addLocalDays,
  dateColumnToLocalDate,
  localDateToDateColumn,
  todayIn,
  weekdayOf,
  zonedToInstant,
  type LocalDate,
} from "@/modules/shared/dates";

export type WindowInfo = { id: string; label: string; startLocal: string; endLocal: string };

export type AvailabilityInputs = {
  timezone: string;
  minLeadHours: number;
  maxAdvanceDays: number;
  windows: WindowInfo[];
  fromDate: LocalDate;
  toDate: LocalDate;
  now: Date;
  /** capacity for (date, windowId); provider decides FIXED vs DERIVED. */
  capacityFor: (date: LocalDate, windowId: string) => number;
  blackouts: { date: LocalDate; windowId: string | null }[];
  booked: Map<string, number>; // `${date}|${windowStartLocal}` -> count
};

export type WindowAvailability = {
  windowId: string;
  label: string;
  startLocal: string;
  endLocal: string;
  open: boolean;
  remaining: number;
  reason?: "OUT_OF_RANGE" | "BLACKOUT" | "LEAD_TIME" | "FULL";
};

export type DayAvailability = { date: LocalDate; windows: WindowAvailability[] };

export const ACTIVE_JOB_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "ASSIGNED",
  "EN_ROUTE",
  "IN_PROGRESS",
  "COMPLETED",
] as const;

/** Pure availability computation. */
export function computeAvailability(inp: AvailabilityInputs): DayAvailability[] {
  const today = todayIn(inp.timezone, inp.now);
  const last = addLocalDays(today, inp.maxAdvanceDays);
  const leadCutoff = inp.now.getTime() + inp.minLeadHours * 3600_000;
  const days: DayAvailability[] = [];
  for (let date = inp.fromDate; date <= inp.toDate; date = addLocalDays(date, 1)) {
    const windows = inp.windows.map((w): WindowAvailability => {
      const base = {
        windowId: w.id,
        label: w.label,
        startLocal: w.startLocal,
        endLocal: w.endLocal,
      };
      if (date < today || date > last)
        return { ...base, open: false, remaining: 0, reason: "OUT_OF_RANGE" };
      if (
        inp.blackouts.some((b) => b.date === date && (b.windowId === null || b.windowId === w.id))
      )
        return { ...base, open: false, remaining: 0, reason: "BLACKOUT" };
      if (zonedToInstant(date, w.startLocal, inp.timezone).getTime() < leadCutoff)
        return { ...base, open: false, remaining: 0, reason: "LEAD_TIME" };
      const capacity = inp.capacityFor(date, w.id);
      const booked = inp.booked.get(`${date}|${w.startLocal}`) ?? 0;
      const remaining = Math.max(0, capacity - booked);
      return {
        ...base,
        open: remaining > 0,
        remaining,
        reason: remaining > 0 ? undefined : "FULL",
      };
    });
    days.push({ date, windows });
  }
  return days;
}

/** Loads region config + booked counts and runs the pure computation (FIXED capacity mode). */
export async function loadAvailability(
  regionId: string,
  fromDate: LocalDate,
  toDate: LocalDate,
  now = new Date(),
): Promise<DayAvailability[]> {
  const region = await prisma.region.findUniqueOrThrow({
    where: { id: regionId },
    include: {
      windows: { where: { active: true }, orderBy: { sortOrder: "asc" } },
      capacities: true,
      blackouts: {
        where: {
          date: { gte: localDateToDateColumn(fromDate), lte: localDateToDateColumn(toDate) },
        },
      },
    },
  });
  const counts = await prisma.job.groupBy({
    by: ["scheduledDate", "windowStartLocal"],
    where: {
      regionId,
      status: { in: [...ACTIVE_JOB_STATUSES] },
      scheduledDate: { gte: localDateToDateColumn(fromDate), lte: localDateToDateColumn(toDate) },
    },
    _count: { _all: true },
  });
  const booked = new Map<string, number>();
  for (const c of counts)
    booked.set(`${dateColumnToLocalDate(c.scheduledDate)}|${c.windowStartLocal}`, c._count._all);

  const byDate = new Map<string, number>();
  const byWeekday = new Map<string, number>();
  for (const c of region.capacities) {
    if (c.date) byDate.set(`${dateColumnToLocalDate(c.date)}|${c.windowId}`, c.capacity);
    else if (c.weekday !== null) byWeekday.set(`${c.weekday}|${c.windowId}`, c.capacity);
  }

  const fixed = (date: LocalDate, windowId: string) =>
    byDate.get(`${date}|${windowId}`) ?? byWeekday.get(`${weekdayOf(date)}|${windowId}`) ?? 0;
  const derived =
    region.capacityMode === "DERIVED"
      ? await derivedCapacity(regionId, region.windows, fromDate, toDate)
      : null;

  return computeAvailability({
    timezone: region.timezone,
    minLeadHours: region.minLeadHours,
    maxAdvanceDays: region.maxAdvanceDays,
    windows: region.windows,
    fromDate,
    toDate,
    now,
    // DERIVED: cleaners whose weekly availability covers the window and who are not on time off.
    // A date-specific FIXED override still wins so dispatch can cap or boost a single day.
    capacityFor: (date, windowId) =>
      derived
        ? (byDate.get(`${date}|${windowId}`) ?? derived(date, windowId))
        : fixed(date, windowId),
    blackouts: region.blackouts.map((b) => ({
      date: dateColumnToLocalDate(b.date),
      windowId: b.windowId,
    })),
    booked,
  });
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Capacity from cleaner schedules: count of active cleaners serving the region available for the window. */
async function derivedCapacity(
  regionId: string,
  windows: WindowInfo[],
  fromDate: LocalDate,
  toDate: LocalDate,
) {
  const cleaners = await prisma.cleaner.findMany({
    where: {
      status: "ACTIVE",
      OR: [{ homeRegionId: regionId }, { regions: { some: { regionId } } }],
    },
    include: {
      availability: true,
      timeOff: {
        where: {
          status: "APPROVED",
          endsAt: { gte: localDateToDateColumn(fromDate) },
          startsAt: { lte: localDateToDateColumn(addLocalDays(toDate, 1)) },
        },
      },
    },
  });
  return (date: LocalDate, windowId: string) => {
    const w = windows.find((x) => x.id === windowId);
    if (!w) return 0;
    const wd = weekdayOf(date);
    const dayStart = localDateToDateColumn(date).getTime();
    const dayEnd = dayStart + 86_400_000;
    return cleaners.filter((c) => {
      const off = c.timeOff.some(
        (t) => t.startsAt.getTime() < dayEnd && t.endsAt.getTime() > dayStart,
      );
      if (off) return false;
      return c.availability.some(
        (a) =>
          a.weekday === wd &&
          toMin(a.startLocal) <= toMin(w.startLocal) &&
          toMin(a.endLocal) >= toMin(w.endLocal),
      );
    }).length;
  };
}
