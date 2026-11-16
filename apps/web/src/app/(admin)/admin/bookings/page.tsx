import Link from "next/link";
import { StatusBadge } from "@/components/admin/ui";
import { Button, buttonVariants } from "@/components/ui/button";
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

export const dynamic = "force-dynamic";

const FREQ: Record<string, string> = {
  ONE_TIME: "One-time",
  WEEKLY: "Weekly",
  BIWEEKLY: "Bi-weekly",
  EVERY_4_WEEKS: "Every 4 wks",
};

export default async function BookingsPage({ searchParams }: PageProps<"/admin/bookings">) {
  const ctx = await requireRole("/admin/login", "SUPER_ADMIN", "REGION_ADMIN");
  const p = await searchParams;
  const status = typeof p.status === "string" ? p.status : "";
  const q = typeof p.q === "string" ? p.q : "";
  const bookings = await prisma.booking.findMany({
    where: {
      ...regionWhere(ctx),
      ...(status ? { status: status as "ACTIVE" } : {}),
      ...(q
        ? {
            OR: [
              { bookingNumber: { contains: q.toUpperCase() } },
              {
                customer: {
                  OR: [
                    { lastName: { contains: q, mode: "insensitive" } },
                    { email: { contains: q, mode: "insensitive" } },
                  ],
                },
              },
            ],
          }
        : {}),
    },
    include: {
      customer: true,
      service: true,
      region: true,
      window: true,
      _count: { select: { jobs: true } },
      jobs: {
        where: { status: { in: ["CONFIRMED", "ASSIGNED", "PENDING"] } },
        orderBy: { scheduledDate: "asc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Bookings</h1>
        <Link href="/admin/bookings/new" className={buttonVariants({ size: "sm" })}>
          New booking
        </Link>
      </div>
      <form className="flex flex-wrap items-end gap-2 text-sm">
        <select
          name="status"
          defaultValue={status}
          className="h-8 rounded-lg border bg-background px-2"
        >
          <option value="">Any status</option>
          {["ACTIVE", "PAUSED", "PENDING", "CANCELLED", "COMPLETED"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          name="q"
          defaultValue={q}
          placeholder="Booking # or customer"
          className="h-8 rounded-lg border px-2"
        />
        <Button type="submit" size="sm" variant="outline">
          Filter
        </Button>
      </form>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Booking</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Service</TableHead>
            <TableHead>Frequency</TableHead>
            <TableHead>Region</TableHead>
            <TableHead>Next visit</TableHead>
            <TableHead>Visits</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bookings.map((b) => (
            <TableRow key={b.id}>
              <TableCell className="font-mono text-xs">
                <Link href={`/admin/bookings/${b.id}`} className="hover:underline">
                  {b.bookingNumber}
                </Link>
              </TableCell>
              <TableCell>
                {b.customer.firstName} {b.customer.lastName}
              </TableCell>
              <TableCell>{b.service.name}</TableCell>
              <TableCell>
                {FREQ[b.frequency]} · {b.window.label}
              </TableCell>
              <TableCell>{b.region.name}</TableCell>
              <TableCell>
                {b.jobs[0] ? dateColumnToLocalDate(b.jobs[0].scheduledDate) : "—"}
              </TableCell>
              <TableCell>{b._count.jobs}</TableCell>
              <TableCell>
                <StatusBadge status={b.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
