import Link from "next/link";
import { CloneButton } from "@/components/admin/pricing-panels";
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

export default async function PricingPage() {
  const ctx = await requireRole("/admin/login", "SUPER_ADMIN");
  const [tables, regions, taxes] = await Promise.all([
    prisma.pricingTable.findMany({
      where: { organizationId: ctx.orgId },
      include: { region: true, _count: { select: { rates: true, quotes: true } } },
      orderBy: [{ regionId: "asc" }, { version: "desc" }],
    }),
    prisma.region.findMany({ where: { organizationId: ctx.orgId }, orderBy: { name: "asc" } }),
    prisma.taxRate.findMany({ orderBy: [{ province: "asc" }, { name: "asc" }] }),
  ]);
  const orgDefault = tables.find((t) => !t.regionId && t.status === "PUBLISHED");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Pricing</h1>
        <p className="text-sm text-muted-foreground">
          Rate sheets are versioned. Published tables are immutable: clone to a draft, edit, then
          publish. Region tables override the org default row by row.
        </p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Scope</TableHead>
            <TableHead>Version</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Effective</TableHead>
            <TableHead>Rates</TableHead>
            <TableHead>Quotes</TableHead>
            <TableHead>Notes</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tables.map((t) => (
            <TableRow key={t.id}>
              <TableCell>
                <Link href={`/admin/pricing/${t.id}`} className="font-medium hover:underline">
                  {t.region ? t.region.name : "Organization default"}
                </Link>
              </TableCell>
              <TableCell>v{t.version}</TableCell>
              <TableCell>
                <StatusBadge status={t.status} />
              </TableCell>
              <TableCell>{t.effectiveFrom.toISOString().slice(0, 10)}</TableCell>
              <TableCell>{t._count.rates}</TableCell>
              <TableCell>{t._count.quotes}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{t.notes}</TableCell>
              <TableCell>
                <CloneButton tableId={t.id} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {orgDefault ? (
        <div className="space-y-2">
          <h2 className="font-medium">Create a region override</h2>
          <div className="flex flex-wrap gap-2">
            {regions
              .filter((r) => !tables.some((t) => t.regionId === r.id))
              .map((r) => (
                <CloneButton
                  key={r.id}
                  tableId={orgDefault.id}
                  regionId={r.id}
                  label={`${r.name} draft`}
                />
              ))}
          </div>
        </div>
      ) : null}
      <div>
        <h2 className="mb-2 font-medium">Tax rates</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Province</TableHead>
              <TableHead>Tax</TableHead>
              <TableHead>Rate</TableHead>
              <TableHead>Effective</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {taxes.map((t) => (
              <TableRow key={t.id}>
                <TableCell>{t.province}</TableCell>
                <TableCell>{t.name}</TableCell>
                <TableCell>{t.rateBps / 100}%</TableCell>
                <TableCell>
                  {t.effectiveFrom.toISOString().slice(0, 10)}
                  {t.effectiveTo ? ` → ${t.effectiveTo.toISOString().slice(0, 10)}` : ""}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
