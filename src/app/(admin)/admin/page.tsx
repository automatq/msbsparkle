import { prisma } from "@/modules/db/client";
import { regionWhere } from "@/modules/db/scoped";
import { requireRole } from "@/modules/auth/session";
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
    </div>
  );
}
