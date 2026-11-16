import Link from "next/link";
import { notFound } from "next/navigation";
import { PublishPanel, RateCell } from "@/components/admin/pricing-panels";
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

const KIND_ORDER = [
  "BASE",
  "BEDROOM",
  "BATHROOM",
  "SQFT_BAND",
  "SERVICE_SURCHARGE",
  "FIRST_CLEAN_UPGRADE",
  "EXTRA",
  "HOURLY_RATE",
  "HOURLY_MIN",
  "FREQUENCY_DISCOUNT",
  "MIN_JOB",
];

export default async function PricingTablePage({ params }: PageProps<"/admin/pricing/[id]">) {
  const ctx = await requireRole("/admin/login", "SUPER_ADMIN");
  const { id } = await params;
  const t = await prisma.pricingTable.findUnique({
    where: { id },
    include: { region: true, rates: true },
  });
  if (!t || t.organizationId !== ctx.orgId) notFound();
  const editable = t.status === "DRAFT";
  const rates = [...t.rates].sort(
    (a, b) =>
      KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
      a.key.localeCompare(b.key, undefined, { numeric: true }),
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">
            <Link href="/admin/pricing" className="hover:underline">
              Pricing
            </Link>
          </p>
          <h1 className="flex items-center gap-3 text-2xl font-semibold">
            {t.region ? t.region.name : "Organization default"} · v{t.version}{" "}
            <StatusBadge status={t.status} />
          </h1>
          <p className="text-sm text-muted-foreground">
            Effective {t.effectiveFrom.toISOString().slice(0, 10)}
            {t.notes ? ` · ${t.notes}` : ""}
          </p>
        </div>
        <PublishPanel tableId={t.id} status={t.status} />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Kind</TableHead>
            <TableHead>Key</TableHead>
            <TableHead className="text-right">Amount ($)</TableHead>
            <TableHead className="text-right">Percent (%)</TableHead>
            <TableHead className="text-right">Minutes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rates.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="text-xs">{r.kind.replaceAll("_", " ")}</TableCell>
              <TableCell className="font-mono text-xs">{r.key}</TableCell>
              <TableCell className="text-right">
                <RateCell
                  tableId={t.id}
                  rateId={r.id}
                  field="amountCents"
                  value={r.amountCents}
                  editable={editable && r.kind !== "FREQUENCY_DISCOUNT" && r.kind !== "HOURLY_MIN"}
                />
              </TableCell>
              <TableCell className="text-right">
                <RateCell
                  tableId={t.id}
                  rateId={r.id}
                  field="bps"
                  value={r.bps}
                  editable={editable && r.kind === "FREQUENCY_DISCOUNT"}
                  scale={100}
                  step="0.5"
                />
              </TableCell>
              <TableCell className="text-right">
                <RateCell
                  tableId={t.id}
                  rateId={r.id}
                  field="minutes"
                  value={r.minutes}
                  editable={editable}
                  scale={1}
                  step="5"
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {editable ? (
        <p className="text-xs text-muted-foreground">
          Cells save when you leave them. Publish to make this version live; existing bookings keep
          their locked quotes.
        </p>
      ) : null}
    </div>
  );
}
