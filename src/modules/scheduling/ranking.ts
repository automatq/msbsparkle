import type { LocalDate } from "@/modules/shared/dates";

/** Minimal shapes so the ranking is a pure, unit-testable function. */
export type CandidateCleaner = {
  id: string;
  firstName: string;
  status: string;
  servesRegion: boolean;
  skills: string[];
  ratingAvg: number | null;
  ratingCount: number;
  maxJobsPerDay: number;
  /** Weekly availability rows for the job's weekday, "HH:mm". */
  availability: { startLocal: string; endLocal: string }[];
  onTimeOff: boolean;
  jobsThatDay: number;
  conflicts: number;
  completedForCustomer: number;
  isPreferred: boolean;
};

export type JobForRanking = {
  date: LocalDate;
  windowStartLocal: string;
  windowEndLocal: string;
  estimatedMinutes: number;
  requiredSkill: string | null;
};

export type RankedCleaner = {
  id: string;
  firstName: string;
  score: number;
  eligible: boolean;
  reasons: string[];
  warnings: string[];
};

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/**
 * Orders cleaners for a job. Hard blockers make a cleaner ineligible; everything else is a
 * weighted score with human-readable reasons so dispatchers can see why.
 * Priority: preferred cleaner > served this customer before > rating > lightest day.
 */
export function rankCleaners(job: JobForRanking, cleaners: CandidateCleaner[]): RankedCleaner[] {
  const start = toMin(job.windowStartLocal);
  const end = Math.max(toMin(job.windowEndLocal), start + job.estimatedMinutes);
  return cleaners
    .map((c): RankedCleaner => {
      const reasons: string[] = [];
      const warnings: string[] = [];
      let eligible = true;
      let score = 0;
      if (c.status !== "ACTIVE") {
        eligible = false;
        warnings.push("not active");
      }
      if (!c.servesRegion) {
        eligible = false;
        warnings.push("does not serve this region");
      }
      if (c.onTimeOff) {
        eligible = false;
        warnings.push("on time off");
      }
      if (c.conflicts > 0) {
        eligible = false;
        warnings.push(`overlaps ${c.conflicts} job${c.conflicts > 1 ? "s" : ""}`);
      }
      if (job.requiredSkill && !c.skills.includes(job.requiredSkill)) {
        score -= 20;
        warnings.push(`no ${job.requiredSkill.toLowerCase().replace("_", " ")} skill`);
      }
      const covers = c.availability.some(
        (a) => toMin(a.startLocal) <= start && toMin(a.endLocal) >= end,
      );
      if (covers) {
        score += 20;
        reasons.push("available");
      } else if (c.availability.length) {
        score -= 15;
        warnings.push("outside usual hours");
      } else {
        warnings.push("no availability set");
      }
      if (c.jobsThatDay >= c.maxJobsPerDay) {
        score -= 25;
        warnings.push(`at daily limit (${c.jobsThatDay}/${c.maxJobsPerDay})`);
      } else {
        score += Math.max(0, 10 - c.jobsThatDay * 3);
        if (c.jobsThatDay === 0) reasons.push("free that day");
      }
      if (c.isPreferred) {
        score += 100;
        reasons.push("customer's preferred cleaner");
      }
      if (c.completedForCustomer > 0) {
        score += 40 + Math.min(c.completedForCustomer, 5) * 2;
        reasons.push(`served this customer ${c.completedForCustomer}×`);
      }
      if (c.ratingAvg != null && c.ratingCount > 0) {
        score += (c.ratingAvg - 3) * 8;
        reasons.push(`★ ${c.ratingAvg.toFixed(1)} (${c.ratingCount})`);
      }
      return {
        id: c.id,
        firstName: c.firstName,
        score: Math.round(score),
        eligible,
        reasons,
        warnings,
      };
    })
    .sort(
      (a, b) =>
        Number(b.eligible) - Number(a.eligible) ||
        b.score - a.score ||
        a.firstName.localeCompare(b.firstName),
    );
}
