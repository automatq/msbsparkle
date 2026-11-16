import { jobsQuery } from "@msb/shared/mobile-api";
import { listJobs } from "@/modules/cleaner/service";
import { toJobSummary } from "@/modules/mobile-api/dto";
import { apiError, apiOk, cleanerRoute, parseQuery } from "@/modules/mobile-api/http";
import { addLocalDays, localDateToDateColumn, todayIn } from "@/modules/shared/dates";

export const runtime = "nodejs";

const MAX_RANGE_DAYS = 62;

/** Offered and accepted jobs. Defaults to yesterday through two weeks out, like the web portal. */
export const GET = cleanerRoute(async ({ req, actor }) => {
  const q = parseQuery(req, jobsQuery);
  if ("response" in q) return q.response;
  const today = todayIn(actor.timezone);
  const from = q.data.from ?? addLocalDays(today, -1);
  const to = q.data.to ?? addLocalDays(today, 14);
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
  if (!(days >= 0 && days <= MAX_RANGE_DAYS))
    return apiError("INVALID", `Ask for at most ${MAX_RANGE_DAYS} days, with from before to.`);
  const rows = await listJobs(actor, localDateToDateColumn(from), localDateToDateColumn(to));
  return apiOk({ from, to, today, jobs: rows.map(toJobSummary) });
});
