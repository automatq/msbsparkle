import Link from "next/link";
import { notFound } from "next/navigation";
import { BookingControls } from "@/components/admin/booking-panels";
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
import { assertRegionAccess, requireRole } from "@/modules/auth/session";
import { prisma } from "@/modules/db/client";
import { dateColumnToLocalDate } from "@/modules/shared/dates";
import { formatCents } from "@/modules/shared/money";

export const dynamic = "force-dynamic";

export default async function BookingPage({ params }: PageProps<"/admin/bookings/[id]">) {
  const ctx = await requireRole("/admin/login", "SUPER_ADMIN", "REGION_ADMIN");
  const { id } = await params;
  const b = await prisma.booking.findUnique({
    where: { id },
    include: {
      customer: true,
      service: true,
      region: true,
      window: true,
      address: true,
      paymentMethod: true,
      promoCode: true,
      jobs: {
        orderBy: { sequenceNumber: "asc" },
        include: {
          activeQuote: true,
          assignments: {
            where: { status: { in: ["ACCEPTED", "OFFERED"] } },
            include: { cleaner: true },
          },
        },
      },
    },
  });
  if (!b) notFound();
  try {
    assertRegionAccess(ctx, b.regionId);
  } catch {
    return <p className="text-destructive">You don&apos;t have access to this region.</p>;
  }
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-muted-foreground">
          <Link href="/admin/bookings" className="hover:underline">
            Bookings
          </Link>
        </p>
        <h1 className="flex items-center gap-3 text-2xl font-semibold">
          {b.bookingNumber} <StatusBadge status={b.status} />
        </h1>
        <p className="text-sm text-muted-foreground">
          {b.service.name} · {b.frequency.replaceAll("_", " ").toLowerCase()} · {b.window.label} ·{" "}
          {b.region.name} · created {b.createdAt.toLocaleDateString("en-CA")} via{" "}
          {b.source.toLowerCase()}
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Visits</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Cleaner</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {b.jobs.map((j) => (
                    <TableRow key={j.id}>
                      <TableCell>
                        {j.sequenceNumber}
                        {j.detached ? "*" : ""}
                      </TableCell>
                      <TableCell>
                        <Link href={`/admin/jobs/${j.id}`} className="hover:underline">
                          {dateColumnToLocalDate(j.scheduledDate)} {j.windowStartLocal}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {j.assignments.map((a) => a.cleaner.firstName).join(", ") || (
                          <span className="text-amber-700">—</span>
                        )}
                      </TableCell>
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
              <p className="mt-2 text-xs text-muted-foreground">
                * edited individually; series edits skip these. Recurring visits are generated {"8"}{" "}
                weeks ahead
                {b.generatedThrough
                  ? ` (through ${dateColumnToLocalDate(b.generatedThrough)})`
                  : ""}
                .
              </p>
            </CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>
                <Link
                  href={`/admin/customers/${b.customerId}`}
                  className="font-medium hover:underline"
                >
                  {b.customer.firstName} {b.customer.lastName}
                </Link>
              </p>
              <p className="text-muted-foreground">
                {b.customer.email} · {b.customer.phone}
              </p>
              <p className="pt-1">
                {b.address.line1}
                {b.address.line2 ? `, ${b.address.line2}` : ""}, {b.address.city}{" "}
                {b.address.postalCode}
              </p>
              <p className="pt-1 text-muted-foreground">
                {b.paymentMethod
                  ? `${b.paymentMethod.brand} •••• ${b.paymentMethod.last4}`
                  : "No card on file"}
                {b.promoCode ? ` · promo ${b.promoCode.code}` : ""}
              </p>
              <p className="text-muted-foreground">
                {b.bedrooms} bd · {b.bathrooms.toString()} ba{b.sqft ? ` · ${b.sqft} sq ft` : ""}
              </p>
              {b.customerNotes ? <p className="pt-1">{b.customerNotes}</p> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Manage</CardTitle>
            </CardHeader>
            <CardContent>
              <BookingControls
                bookingId={b.id}
                status={b.status}
                internalNotes={b.internalNotes ?? ""}
                recurring={b.frequency !== "ONE_TIME"}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
