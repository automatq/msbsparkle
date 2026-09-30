import { prisma } from "@/modules/db/client";
import { regionWhere } from "@/modules/db/scoped";
import { requireRole } from "@/modules/auth/session";
import { TimeOffActions } from "@/components/admin/payout-panels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AdminDashboard() {
  const ctx = await requireRole("/admin/login", "SUPER_ADMIN", "REGION_ADMIN");
  const scope = regionWhere(ctx);
  const [regions, cleaners, jobs, customers] = await Promise.all([
    prisma.region.count({ where: ctx.isSuperAdmin ? {} : { id: { in: ctx.regionIds } } }),
    prisma.cleaner.count({
      where: ctx.isSuperAdmin ? {} : { homeRegionId: { in: ctx.regionIds } },
    }),
    prisma.job.count({ where: { ...scope, status: { in: ["CONFIRMED", "ASSIGNED"] } } }),
    prisma.customer.count({ where: ctx.isSuperAdmin ? {} : { bookings: { some: scope } } }),
  ]);
  const timeOff = await prisma.timeOff.findMany({
    where: {
      status: "REQUESTED",
      endsAt: { gte: new Date() },
      cleaner: ctx.isSuperAdmin ? {} : { homeRegionId: { in: ctx.regionIds } },
    },
    include: { cleaner: { include: { homeRegion: true } } },
    orderBy: { startsAt: "asc" },
    take: 20,
  });
  const tiles = [
    ["Regions", regions],
    ["Active cleaners", cleaners],
    ["Upcoming jobs", jobs],
    ["Customers", customers],
  ] as const;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map(([label, value]) => (
          <Card key={label}>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      {timeOff.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Time off requests ({timeOff.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {timeOff.map((t) => (
                <li
                  key={t.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2"
                  data-testid={`timeoff-${t.id}`}
                >
                  <span>
                    <span className="font-medium">
                      {t.cleaner.firstName} {t.cleaner.lastName}
                    </span>{" "}
                    · {t.cleaner.homeRegion.name} · {t.startsAt.toISOString().slice(0, 10)} →{" "}
                    {t.endsAt.toISOString().slice(0, 10)}
                    {t.reason ? ` · ${t.reason}` : ""}
                  </span>
                  <TimeOffActions id={t.id} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
