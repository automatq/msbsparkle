import { getCtx } from "@/modules/auth/session";
import { prisma } from "@/modules/db/client";

const csv = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

export async function GET(req: Request) {
  const ctx = await getCtx("SUPER_ADMIN", "REGION_ADMIN");
  const url = new URL(req.url);
  const start = url.searchParams.get("start") ?? "2000-01-01";
  const end = url.searchParams.get("end") ?? "2100-01-01";
  const payouts = await prisma.payout.findMany({
    where: {
      cleaner: ctx.isSuperAdmin ? {} : { homeRegionId: { in: ctx.regionIds } },
      periodEnd: { gte: new Date(`${start}T00:00:00Z`) },
      periodStart: { lte: new Date(`${end}T23:59:59Z`) },
    },
    include: { cleaner: { include: { homeRegion: true } }, _count: { select: { earnings: true } } },
    orderBy: [{ periodStart: "asc" }, { createdAt: "asc" }],
  });
  const header = [
    "payout_id",
    "cleaner",
    "email",
    "phone",
    "region",
    "period_start",
    "period_end",
    "jobs",
    "total",
    "method",
    "status",
    "paid_at",
  ];
  const rows = payouts.map((p) => [
    p.id,
    `${p.cleaner.firstName} ${p.cleaner.lastName}`,
    p.cleaner.email,
    p.cleaner.phone,
    p.cleaner.homeRegion.name,
    p.periodStart.toISOString().slice(0, 10),
    p.periodEnd.toISOString().slice(0, 10),
    p._count.earnings,
    (p.totalCents / 100).toFixed(2),
    p.method,
    p.status,
    p.paidAt?.toISOString() ?? "",
  ]);
  return new Response([header, ...rows].map((r) => r.map(csv).join(",")).join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="payouts-${start}-to-${end}.csv"`,
    },
  });
}
