import Link from "next/link";
import { AddRequestedArea } from "@/components/admin/area-tax-panels";
import { StatusBadge } from "@/components/admin/ui";
import { buttonVariants } from "@/components/ui/button";
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
import { country, subdivisionName } from "@/modules/shared/country";

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
  const requested = ctx.isSuperAdmin ? await requestedAreas(ctx.orgId) : [];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Regions</h1>
        {ctx.isSuperAdmin ? (
          <Link href="/admin/regions/new" className={buttonVariants({ size: "sm" })}>
            New region
          </Link>
        ) : null}
      </div>
      {regions.length === 0 ? (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">
          No regions yet. Create one, add its {country.areaLabel}s, then set it to Active to start
          taking bookings.
        </p>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Region</TableHead>
            <TableHead>{country.subdivisionLabel}</TableHead>
            <TableHead>Timezone</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>{country.areaLabel}s</TableHead>
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
              <TableCell>{subdivisionName(r.province)}</TableCell>
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
      {requested.length ? (
        <section className="space-y-2 pt-6">
          <h2 className="font-medium">Requested areas</h2>
          <p className="text-sm text-muted-foreground">
            Customers who entered a {country.postalLabel.toLowerCase()} you don&apos;t serve yet and
            asked to be notified.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{country.areaLabel}</TableHead>
                <TableHead>Requests</TableHead>
                <TableHead>Latest</TableHead>
                <TableHead>Add to region</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requested.map((a) => (
                <TableRow key={a.prefix}>
                  <TableCell className="font-mono">{a.prefix}</TableCell>
                  <TableCell>{a.count}</TableCell>
                  <TableCell>{a.latest.toISOString().slice(0, 10)}</TableCell>
                  <TableCell>
                    <AddRequestedArea
                      prefix={a.prefix}
                      regions={regions.map((r) => ({ id: r.id, name: r.name }))}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}
    </div>
  );
}

/** Out-of-area requests grouped by prefix, excluding prefixes that are now served. */
async function requestedAreas(organizationId: string) {
  const groups = await prisma.serviceAreaRequest.groupBy({
    by: ["postalPrefix"],
    where: { organizationId },
    _count: { _all: true },
    _max: { createdAt: true },
    orderBy: { _count: { postalPrefix: "desc" } },
    take: 50,
  });
  const served = new Set(
    (
      await prisma.serviceArea.findMany({
        where: { postalPrefix: { in: groups.map((g) => g.postalPrefix) } },
        select: { postalPrefix: true },
      })
    ).map((a) => a.postalPrefix),
  );
  return groups
    .filter((g) => !served.has(g.postalPrefix))
    .map((g) => ({ prefix: g.postalPrefix, count: g._count._all, latest: g._max.createdAt! }));
}
