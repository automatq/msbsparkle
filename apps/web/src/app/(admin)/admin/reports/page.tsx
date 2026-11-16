import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { reportData } from "@/modules/admin/reports";
import { requireRole } from "@/modules/auth/session";
import { formatCents } from "@/modules/shared/money";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const ctx = await requireRole("/admin/login", "SUPER_ADMIN", "REGION_ADMIN");
  const r = await reportData(ctx);
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="text-sm text-muted-foreground">
            {r.from} to {r.to} · {r.total} jobs
          </p>
        </div>
        <Link
          href="/admin/reports/jobs.csv"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Export jobs CSV
        </Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Completed revenue by week (pre-tip, incl. tax)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Week of</TableHead>
                {r.regions.map((x) => (
                  <TableHead key={x} className="text-right">
                    {x}
                  </TableHead>
                ))}
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {r.weeks.map((w) => {
                const m = r.revenue.get(w)!;
                const tot = [...m.values()].reduce((s, v) => s + v, 0);
                return (
                  <TableRow key={w}>
                    <TableCell>{w}</TableCell>
                    {r.regions.map((x) => (
                      <TableCell key={x} className="text-right">
                        {formatCents(m.get(x) ?? 0)}
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-medium">{formatCents(tot)}</TableCell>
                  </TableRow>
                );
              })}
              {r.weeks.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={r.regions.length + 2}
                    className="text-center text-muted-foreground"
                  >
                    No completed jobs in range.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Jobs by status</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                {[...r.byStatus.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([s, n]) => (
                    <TableRow key={s}>
                      <TableCell>{s.replaceAll("_", " ")}</TableCell>
                      <TableCell className="text-right">{n}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Cleaner utilization (assigned)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cleaner</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead className="text-right">Jobs</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.util.map((u) => (
                  <TableRow key={u.name}>
                    <TableCell>{u.name}</TableCell>
                    <TableCell>{u.region}</TableCell>
                    <TableCell className="text-right">{u.jobs}</TableCell>
                    <TableCell className="text-right">{(u.minutes / 60).toFixed(1)}</TableCell>
                  </TableRow>
                ))}
                {r.util.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No assignments yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
