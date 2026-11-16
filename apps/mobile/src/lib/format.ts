/** Formatting with the company's locale and currency (from `me`). */
export function money(cents: number, currency = "CAD", locale = "en-CA") {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
}

export function dayLabel(isoDate: string, locale = "en-CA") {
  // Date-only values: format at noon UTC so no timezone shifts the day.
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T12:00:00Z`));
}

export function timeIn(iso: string, timeZone: string, locale = "en-CA") {
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone }).format(
    new Date(iso),
  );
}

export const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  ASSIGNED: "Assigned",
  EN_ROUTE: "On the way",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  SKIPPED: "Skipped",
  NO_SHOW: "No-show",
};
