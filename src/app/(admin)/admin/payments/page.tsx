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
import { regionWhere } from "@/modules/db/scoped";
import { isStripeConfigured } from "@/modules/payments/stripe";
import { dateColumnToLocalDate } from "@/modules/shared/dates";
import { formatCents } from "@/modules/shared/money";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  const ctx = await requireRole("/admin/login", "SUPER_ADMIN", "REGION_ADMIN");
  const scope = regionWhere(ctx);
  const [due, charges] = await Promise.all([
    prisma.job.findMany({
      where: { ...scope, status: "COMPLETED", paymentStatus: { in: ["UNPAID", "FAILED"] } },
      include: { customer: true, booking: true, activeQuote: true, region: true },
      orderBy: { completedAt: "asc" },
      take: 100,
    }),
    prisma.charge.findMany({
      where: { OR: [{ job: scope }, { jobId: null }], organizationId: ctx.orgId },
      include: { customer: true, job: { include: { booking: true } }, refunds: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Payments</h1>
        <p className="text-sm text-muted-foreground">
          {isStripeConfigured()
            ? "Stripe connected."
            : "Stripe is not configured; charges cannot be collected in this environment."}{" "}
          Cards are charged after each visit is completed.
        </p>
      </div>
      <section className="space-y-2">
        <h2 className="font-medium">Completed, awaiting charge ({due.length})</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Completed</TableHead>
              <TableHead>Booking</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Region</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {due.map((j) => (
              <TableRow key={j.id}>
                <TableCell>
                  <Link href={`/admin/jobs/${j.id}`} className="hover:underline">
                    {dateColumnToLocalDate(j.scheduledDate)}
                  </Link>
                </TableCell>
                <TableCell className="font-mono text-xs">{j.booking.bookingNumber}</TableCell>
                <TableCell>
                  {j.customer.firstName} {j.customer.lastName}
                </TableCell>
                <TableCell>{j.region.name}</TableCell>
                <TableCell>
                  <StatusBadge status={j.paymentStatus} />
                </TableCell>
                <TableCell className="text-right">
                  {formatCents((j.activeQuote?.totalCents ?? 0) + j.tipCents)}
                </TableCell>
              </TableRow>
            ))}
            {due.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Nothing outstanding.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </section>
      <section className="space-y-2">
        <h2 className="font-medium">Recent charges</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Booking</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Refunded</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {charges.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{c.createdAt.toLocaleDateString("en-CA")}</TableCell>
                <TableCell>{c.type.replaceAll("_", " ")}</TableCell>
                <TableCell>
                  {c.customer.firstName} {c.customer.lastName}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {c.job ? (
                    <Link href={`/admin/jobs/${c.job.id}`} className="hover:underline">
                      {c.job.booking.bookingNumber}
                    </Link>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>
                  <StatusBadge status={c.status} />
                  {c.failureMessage ? (
                    <div className="text-xs text-rose-700">{c.failureMessage}</div>
                  ) : null}
                </TableCell>
                <TableCell className="text-right">{formatCents(c.amountCents)}</TableCell>
                <TableCell className="text-right">
                  {formatCents(
                    c.refunds
                      .filter((r) => r.status === "SUCCEEDED")
                      .reduce((s, r) => s + r.amountCents, 0),
                  )}
                </TableCell>
              </TableRow>
            ))}
            {charges.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No charges yet.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
