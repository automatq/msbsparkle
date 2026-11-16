import { PromoForm, PromoToggle } from "@/components/admin/marketing-panels";
import { StatusBadge } from "@/components/admin/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { formatCents } from "@/modules/shared/money";

export const dynamic = "force-dynamic";

export default async function PromosPage() {
  const ctx = await requireRole("/admin/login", "SUPER_ADMIN");
  const [promos, regions] = await Promise.all([
    prisma.promoCode.findMany({
      where: { organizationId: ctx.orgId },
      include: { _count: { select: { redemptions: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.region.findMany({
      where: { organizationId: ctx.orgId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Promo codes</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Discount</TableHead>
            <TableHead>Applies</TableHead>
            <TableHead>Limits</TableHead>
            <TableHead>Window</TableHead>
            <TableHead>Used</TableHead>
            <TableHead>Status</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {promos.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-mono">{p.code}</TableCell>
              <TableCell>
                {p.type === "PERCENT" ? `${p.value / 100}%` : formatCents(p.value)}
                {p.maxDiscountCents ? ` (max ${formatCents(p.maxDiscountCents)})` : ""}
              </TableCell>
              <TableCell>
                {p.appliesTo === "FIRST_JOB" ? "First clean" : "Every clean"}
                {p.newCustomersOnly ? " · new customers" : ""}
              </TableCell>
              <TableCell>
                {p.perCustomerLimit}/customer
                {p.maxRedemptions ? ` · ${p.maxRedemptions} total` : ""}
                {p.minSubtotalCents ? ` · min ${formatCents(p.minSubtotalCents)}` : ""}
              </TableCell>
              <TableCell className="text-xs">
                {p.startsAt ? p.startsAt.toISOString().slice(0, 10) : "—"} →{" "}
                {p.endsAt ? p.endsAt.toISOString().slice(0, 10) : "—"}
              </TableCell>
              <TableCell>{p._count.redemptions}</TableCell>
              <TableCell>
                <StatusBadge status={p.active ? "ACTIVE" : "INACTIVE"} />
              </TableCell>
              <TableCell>
                <PromoToggle id={p.id} active={p.active} />
              </TableCell>
            </TableRow>
          ))}
          {promos.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground">
                No promo codes yet.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
      <Card>
        <CardHeader>
          <CardTitle>New promo code</CardTitle>
        </CardHeader>
        <CardContent>
          <PromoForm
            regions={regions}
            initial={{
              code: "",
              type: "PERCENT",
              value: 1000,
              appliesTo: "FIRST_JOB",
              minSubtotalCents: 0,
              maxDiscountCents: null,
              maxRedemptions: null,
              perCustomerLimit: 1,
              newCustomersOnly: true,
              regionIds: [],
              startsAt: "",
              endsAt: "",
              active: true,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
