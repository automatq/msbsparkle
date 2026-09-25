import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";

/** ISO calendar date string, e.g. "2026-10-03". */
export type LocalDate = string;
/** "HH:mm" local wall-clock time. */
export type LocalTime = string;

const partsCache = new Map<string, Intl.DateTimeFormat>();

function dtf(timezone: string): Intl.DateTimeFormat {
  let f = partsCache.get(timezone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsCache.set(timezone, f);
  }
  return f;
}

/** Offset of `timezone` from UTC, in minutes, at the given instant. */
export function tzOffsetMinutes(instant: Date, timezone: string): number {
  const p = Object.fromEntries(
    dtf(timezone)
      .formatToParts(instant)
      .filter((x) => x.type !== "literal")
      .map((x) => [x.type, Number(x.value)]),
  ) as Record<string, number>;
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - instant.getTime()) / 60000);
}

function parseDate(date: LocalDate): [number, number, number] {
  const [y, m, d] = date.split("-").map(Number);
  return [y, m, d];
}

/** Today's date in the given IANA timezone. */
export function todayIn(timezone: string, now: Date = new Date()): LocalDate {
  const p = Object.fromEntries(
    dtf(timezone)
      .formatToParts(now)
      .filter((x) => x.type !== "literal")
      .map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  return `${p.year}-${p.month}-${p.day}`;
}

export function addLocalDays(date: LocalDate, days: number): LocalDate {
  const [y, m, d] = parseDate(date);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Weekday (0 = Sunday) of a local calendar date. */
export function weekdayOf(date: LocalDate): number {
  const [y, m, d] = parseDate(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Convert a local date + "HH:mm" in a timezone to a UTC instant.
 * Handles DST transitions by re-checking the offset at the candidate instant.
 */
export function zonedToInstant(date: LocalDate, time: LocalTime, timezone: string): Date {
  const [y, m, d] = parseDate(date);
  const [hh, mm] = time.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  const guess = new Date(wall - tzOffsetMinutes(new Date(wall), timezone) * 60000);
  const offset2 = tzOffsetMinutes(guess, timezone);
  return new Date(wall - offset2 * 60000);
}

/** Format an instant in a timezone. */
export function formatInZone(
  instant: Date,
  timezone: string,
  fmt = "EEE, MMM d 'at' h:mm a",
): string {
  return format(new TZDate(instant, timezone), fmt);
}

/** Prisma @db.Date columns round-trip as JS Dates at UTC midnight. */
export function dateColumnToLocalDate(value: Date): LocalDate {
  return value.toISOString().slice(0, 10);
}

export function localDateToDateColumn(date: LocalDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}
