import Link from "next/link";
import { notFound } from "next/navigation";
import { AnonymizeButton, CustomerNotes } from "@/components/admin/customer-panels";
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
import { regionWhere } from "@/modules/db/scoped";
import { dateColumnToLocalDate } from "@/modules/shared/dates";
import { formatCents } from "@/modules/shared/money";

export const dynamic = "force-dynamic";

export default async function CustomerPage({ params }: PageProps<"/admin/customers/[id]">) {
  const ctx = await requireRole("/admin/login", "SUPER_ADMIN", "REGION_ADMIN");
  const { id } = await params;
  const c = await prisma.customer.findUnique({
    where: { id },
    include: {
      addresses: { include: { region: true }, orderBy: { createdAt: "desc" } },
      paymentMethods: true,
      bookings: {
        where: regionWhere(ctx),
        include: { service: true, region: true, window: true },
        orderBy: { createdAt: "desc" },
      },
      jobs: {
        where: regionWhere(ctx),
        include: { activeQuote: true, booking: true },
        orderBy: { scheduledDate: "desc" },
        take: 30,
      },
    },
  });
  if (!c || c.organizationId !== ctx.orgId) notFound();
  if (!ctx.isSuperAdmin && c.bookings.length === 0)
    return <p className="text-destructive">No bookings in your regions for this customer.</p>;
  const lifetime = c.jobs
    .filter((j) => j.paymentStatus === "PAID")
    .reduce((s, j) => s + (j.activeQuote?.totalCents ?? 0) + j.tipCents, 0);
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-muted-foreground">
          <Link href="/admin/customers" className="hover:underline">
            Customers
          </Link>
        </p>
        <h1 className="text-2xl font-semibold">
          {c.firstName} {c.lastName}
        </h1>
        <p className="text-sm text-muted-foreground">
          {c.email} · {c.phone} · since {c.createdAt.toLocaleDateString("en-CA")} · lifetime paid{" "}
          {formatCents(lifetime)}
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Bookings</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Booking</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {c.bookings.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-mono text-xs">
                        <Link href={`/admin/bookings/${b.id}`} className="hover:underline">
                          {b.bookingNumber}
                        </Link>
                      </TableCell>
                      <TableCell>{b.service.name}</TableCell>
                      <TableCell>
                        {b.frequency.replaceAll("_", " ").toLowerCase()} · {b.window.label}
                      </TableCell>
                      <TableCell>{b.region.name}</TableCell>
                      <TableCell>
                        <StatusBadge status={b.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Recent visits</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Booking</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {c.jobs.map((j) => (
                    <TableRow key={j.id}>
                      <TableCell>
                        <Link href={`/admin/jobs/${j.id}`} className="hover:underline">
                          {dateColumnToLocalDate(j.scheduledDate)} {j.windowStartLocal}
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{j.booking.bookingNumber}</TableCell>
                      <TableCell>
                        <StatusBadge status={j.status} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={j.paymentStatus} />
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCents(j.activeQuote?.totalCents ?? 0)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Addresses</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {c.addresses.map((a) => (
                <div key={a.id}>
                  <p>
                    {a.line1}
                    {a.line2 ? `, ${a.line2}` : ""}
                  </p>
                  <p className="text-muted-foreground">
                    {a.city} {a.postalCode} · {a.region.name}
                    {a.isDefault ? " · default" : ""}
                  </p>
                  {a.entryInstructions ? (
                    <p className="text-xs">Entry: {a.entryInstructions}</p>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Cards</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {c.paymentMethods.length === 0 ? (
                <p className="text-muted-foreground">No card on file.</p>
              ) : null}
              {c.paymentMethods.map((pm) => (
                <p key={pm.id}>
                  {pm.brand} •••• {pm.last4} · {pm.expMonth}/{pm.expYear} · {pm.status}
                  {c.defaultPaymentMethodId === pm.id ? " · default" : ""}
                </p>
              ))}
              <p className="text-xs text-muted-foreground">
                {c.stripeCustomerId ? `Stripe ${c.stripeCustomerId}` : "Not in Stripe yet"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <CustomerNotes customerId={c.id} notes={c.notes ?? ""} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Privacy</CardTitle>
            </CardHeader>
            <CardContent>
              {ctx.isSuperAdmin ? (
                <AnonymizeButton customerId={c.id} anonymized={!!c.anonymizedAt} />
              ) : (
                <p className="text-xs text-muted-foreground">
                  Super admins can delete personal data on request.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
