import type { Frequency } from "@/generated/prisma/enums";
import { addLocalDays, type LocalDate } from "@/modules/shared/dates";

export const FREQUENCY_INTERVAL_DAYS: Record<Frequency, number> = {
  ONE_TIME: 0,
  WEEKLY: 7,
  BIWEEKLY: 14,
  EVERY_4_WEEKS: 28,
};

export type OccurrenceOptions = {
  frequency: Frequency;
  anchorDate: LocalDate;
  /** Generate dates strictly after this date (exclusive). Null = include anchor. */
  after?: LocalDate | null;
  /** Inclusive upper bound. */
  through: LocalDate;
  endsOn?: LocalDate | null;
  pausedFrom?: LocalDate | null;
  pausedUntil?: LocalDate | null;
};

/** Occurrence dates in local calendar terms. Sequence numbers are 1-based from the anchor. */
export function occurrences(
  opts: OccurrenceOptions,
): { date: LocalDate; sequenceNumber: number }[] {
  const out: { date: LocalDate; sequenceNumber: number }[] = [];
  const interval = FREQUENCY_INTERVAL_DAYS[opts.frequency];
  let date = opts.anchorDate;
  let seq = 1;
  for (let guard = 0; guard < 1000; guard++) {
    if (date > opts.through) break;
    if (opts.endsOn && date > opts.endsOn) break;
    const paused =
      opts.pausedFrom && opts.pausedUntil && date >= opts.pausedFrom && date <= opts.pausedUntil;
    const afterCursor = !opts.after || date > opts.after;
    if (afterCursor && !paused) out.push({ date, sequenceNumber: seq });
    if (interval === 0) break;
    date = addLocalDays(date, interval);
    seq++;
  }
  return out;
}
