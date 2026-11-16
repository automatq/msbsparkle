import { AddTaxRateForm, TaxRateActions } from "@/components/admin/area-tax-panels";
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
import { country, subdivisionName, timezone } from "@/modules/shared/country";
import { dateColumnToLocalDate, todayIn } from "@/modules/shared/dates";

export const dynamic = "force-dynamic";

export default async function TaxesPage() {
  await requireRole("/admin/login", "SUPER_ADMIN");
  const today = todayIn(timezone);
  const rates = await prisma.taxRate.findMany({
    orderBy: [{ province: "asc" }, { name: "asc" }, { effectiveFrom: "desc" }],
  });
  const regionProvinces = new Set(
    (await prisma.region.findMany({ select: { province: true } })).map((r) => r.province),
  );
  const status = (from: string, to: string | null) =>
    from > today ? "Scheduled" : to && to <= today ? "Ended" : "Current";
  const rows = rates.map((r) => {
    const from = dateColumnToLocalDate(r.effectiveFrom);
    const to = r.effectiveTo ? dateColumnToLocalDate(r.effectiveTo) : null;
    return { ...r, from, to, status: status(from, to) };
  });
  const untaxed = [...regionProvinces].filter(
    (p) => !rows.some((r) => r.province === p && r.status === "Current"),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Taxes</h1>
        <p className="text-sm text-muted-foreground">
          Rates apply by {country.subdivisionLabel.toLowerCase()} on the service date and are added
          to every quote. To change a rate, add the new one with the same name: the old rate ends
          the day the new one starts, and existing quotes keep the rate they were priced with.
        </p>
      </div>
      {untaxed.length ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          No current tax rate for {untaxed.map((p) => subdivisionName(p)).join(", ")}, where you
          have regions. Quotes there include no tax.
        </p>
      ) : null}
      <AddTaxRateForm today={today} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{country.subdivisionLabel}</TableHead>
            <TableHead>Tax</TableHead>
            <TableHead>Rate</TableHead>
            <TableHead>Effective</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} className={r.status === "Ended" ? "text-muted-foreground" : ""}>
              <TableCell>{subdivisionName(r.province)}</TableCell>
              <TableCell>{r.name}</TableCell>
              <TableCell>{r.rateBps / 100}%</TableCell>
              <TableCell>
                {r.from}
                {r.to ? ` → ${r.to}` : ""}
              </TableCell>
              <TableCell>{r.status}</TableCell>
              <TableCell>
                {r.status === "Ended" ? null : (
                  <TaxRateActions id={r.id} today={today} scheduled={r.status === "Scheduled"} />
                )}
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground">
                No tax rates yet.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
