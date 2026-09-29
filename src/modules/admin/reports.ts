import type { Ctx } from "@/modules/auth/session";
import { prisma } from "@/modules/db/client";
import { regionWhere } from "@/modules/db/scoped";
import {
  addLocalDays,
  dateColumnToLocalDate,
  localDateToDateColumn,
  todayIn,
} from "@/modules/shared/dates";

export async function reportData(ctx: Ctx, weeks = 8) {
  const today = todayIn("America/Toronto");
  const from = addLocalDays(today, -7 * weeks);
  const to = addLocalDays(today, 7);
  const scope = regionWhere(ctx);
  const jobs = await prisma.job.findMany({
    where: {
      ...scope,
      scheduledDate: { gte: localDateToDateColumn(from), lte: localDateToDateColumn(to) },
    },
    include: {
      region: true,
      activeQuote: true,
      assignments: { where: { status: "ACCEPTED" }, include: { cleaner: true } },
    },
  });
  const weekOf = (d: Date) => {
    const iso = dateColumnToLocalDate(d);
    const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
    return addLocalDays(iso, -((dow + 6) % 7)); // Monday
  };
  const revenue = new Map<string, Map<string, number>>(); // week -> region -> cents
  const byStatus = new Map<string, number>();
  const util = new Map<string, { name: string; jobs: number; minutes: number; region: string }>();
  for (const j of jobs) {
    byStatus.set(j.status, (byStatus.get(j.status) ?? 0) + 1);
    if (j.status === "COMPLETED") {
      const w = weekOf(j.scheduledDate);
      const m = revenue.get(w) ?? new Map<string, number>();
      m.set(j.region.name, (m.get(j.region.name) ?? 0) + (j.activeQuote?.totalCents ?? 0));
      revenue.set(w, m);
    }
    for (const a of j.assignments) {
      const u = util.get(a.cleanerId) ?? {
        name: `${a.cleaner.firstName} ${a.cleaner.lastName}`,
        jobs: 0,
        minutes: 0,
        region: j.region.name,
      };
      u.jobs += 1;
      u.minutes += j.estimatedMinutes;
      util.set(a.cleanerId, u);
    }
  }
  const regions = [...new Set(jobs.map((j) => j.region.name))].sort();
  const weeksList = [...revenue.keys()].sort();
  return {
    from,
    to,
    regions,
    weeks: weeksList,
    revenue,
    byStatus,
    util: [...util.values()].sort((a, b) => b.minutes - a.minutes),
    total: jobs.length,
  };
}
