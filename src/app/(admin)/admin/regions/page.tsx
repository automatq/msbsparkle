import Link from "next/link";
import { StatusBadge } from "@/components/admin/ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireRole } from "@/modules/auth/session";
import { prisma } from "@/modules/db/client";

export const dynamic = "force-dynamic";

export default async function RegionsPage() {
  const ctx = await requireRole("/admin/login", "SUPER_ADMIN", "REGION_ADMIN");
  const regions = await prisma.region.findMany({
    where: {
      organizationId: ctx.orgId,
      ...(ctx.isSuperAdmin ? {} : { id: { in: ctx.regionIds } }),
    },
    include: {
      _count: {
        select: {
          serviceAreas: true,
          cities: true,
          homeCleaners: true,
          jobs: { where: { status: { in: ["CONFIRMED", "ASSIGNED"] } } },
        },
      },
      pricingTables: { where: { status: "PUBLISHED" }, orderBy: { version: "desc" }, take: 1 },
    },
    orderBy: [{ province: "asc" }, { name: "asc" }],
  });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Regions</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Region</TableHead>
            <TableHead>Province</TableHead>
            <TableHead>Timezone</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>FSAs</TableHead>
            <TableHead>Cities</TableHead>
            <TableHead>Cleaners</TableHead>
            <TableHead>Upcoming jobs</TableHead>
            <TableHead>Pricing</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {regions.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                <Link href={`/admin/regions/${r.id}`} className="font-medium hover:underline">
                  {r.name}
                </Link>
              </TableCell>
              <TableCell>{r.province}</TableCell>
              <TableCell>{r.timezone}</TableCell>
              <TableCell>
                <StatusBadge status={r.status} />
              </TableCell>
              <TableCell>{r._count.serviceAreas}</TableCell>
              <TableCell>{r._count.cities}</TableCell>
              <TableCell>{r._count.homeCleaners}</TableCell>
              <TableCell>{r._count.jobs}</TableCell>
              <TableCell>
                {r.pricingTables[0] ? `v${r.pricingTables[0].version} (region)` : "org default"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
