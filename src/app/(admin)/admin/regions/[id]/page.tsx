import Link from "next/link";
import { notFound } from "next/navigation";
import { BlackoutPanel, CapacityGrid, RegionPolicyForm } from "@/components/admin/region-panels";
import { StatusBadge } from "@/components/admin/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { assertRegionAccess, requireRole } from "@/modules/auth/session";
import { prisma } from "@/modules/db/client";
import { dateColumnToLocalDate, localDateToDateColumn, todayIn } from "@/modules/shared/dates";

export const dynamic = "force-dynamic";

export default async function RegionPage({ params }: PageProps<"/admin/regions/[id]">) {
  const ctx = await requireRole("/admin/login", "SUPER_ADMIN", "REGION_ADMIN");
  const { id } = await params;
  const r = await prisma.region.findUnique({
    where: { id },
    include: {
      windows: { where: { active: true }, orderBy: { sortOrder: "asc" } },
      capacities: { where: { weekday: { not: null } } },
      blackouts: {
        where: { date: { gte: localDateToDateColumn(todayIn("UTC")) } },
        orderBy: { date: "asc" },
        include: { window: true },
      },
      cities: { orderBy: { name: "asc" } },
      serviceAreas: { orderBy: { fsa: "asc" } },
      pricingTables: { orderBy: { version: "desc" } },
    },
  });
  if (!r || r.organizationId !== ctx.orgId) notFound();
  try {
    assertRegionAccess(ctx, r.id);
  } catch {
    return <p className="text-destructive">You don&apos;t have access to this region.</p>;
  }
  const capacities: Record<string, number> = {};
  for (const c of r.capacities)
    if (c.weekday !== null) capacities[`${c.windowId}|${c.weekday}`] = c.capacity;
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-muted-foreground">
          <Link href="/admin/regions" className="hover:underline">
            Regions
          </Link>
        </p>
        <h1 className="flex items-center gap-3 text-2xl font-semibold">
          {r.name}, {r.province} <StatusBadge status={r.status} />
        </h1>
        <p className="text-sm text-muted-foreground">
          {r.timezone} · {r.serviceAreas.length} postal areas · {r.cities.length} city pages ·
          pricing:{" "}
          {r.pricingTables.find((t) => t.status === "PUBLISHED")
            ? `region v${r.pricingTables.find((t) => t.status === "PUBLISHED")!.version}`
            : "org default"}{" "}
          (
          <Link href="/admin/pricing" className="underline">
            manage
          </Link>
          )
        </p>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Policy</CardTitle>
          </CardHeader>
          <CardContent>
            <RegionPolicyForm
              regionId={r.id}
              canEdit={ctx.isSuperAdmin}
              initial={{
                name: r.name,
                phone: r.phone ?? "",
                email: r.email ?? "",
                status: r.status,
                minLeadHours: r.minLeadHours,
                maxAdvanceDays: r.maxAdvanceDays,
                lateCancelWindowHours: r.lateCancelWindowHours,
                lateCancelFeeType: r.lateCancelFeeType,
                lateCancelFeeValue: r.lateCancelFeeValue,
                requireCleanerAcceptance: r.requireCleanerAcceptance,
              }}
            />
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Capacity per arrival window</CardTitle>
            </CardHeader>
            <CardContent>
              <CapacityGrid regionId={r.id} windows={r.windows} capacities={capacities} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Blackout dates</CardTitle>
            </CardHeader>
            <CardContent>
              <BlackoutPanel
                regionId={r.id}
                windows={r.windows}
                blackouts={r.blackouts.map((b) => ({
                  id: b.id,
                  date: dateColumnToLocalDate(b.date),
                  windowLabel: b.window?.label ?? null,
                  reason: b.reason,
                }))}
              />
            </CardContent>
          </Card>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Service area</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            City pages:{" "}
            {r.cities.map((c, i) => (
              <span key={c.id}>
                {i ? ", " : ""}
                <Link href={`/admin/cities/${c.id}`} className="underline">
                  {c.name}
                </Link>
              </span>
            ))}
          </p>
          <p className="text-xs text-muted-foreground">
            Postal areas (FSA): {r.serviceAreas.map((a) => a.fsa).join(" ")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
