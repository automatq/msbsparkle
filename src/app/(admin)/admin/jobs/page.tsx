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
import { visibleRegions } from "@/modules/admin/regions";
import { requireRole } from "@/modules/auth/session";
import { prisma } from "@/modules/db/client";
import { regionWhere } from "@/modules/db/scoped";
import {
  addLocalDays,
  dateColumnToLocalDate,
  localDateToDateColumn,
  todayIn,
} from "@/modules/shared/dates";
import { formatCents } from "@/modules/shared/money";

export const dynamic = "force-dynamic";

const STATUSES = [
  "PENDING",
  "CONFIRMED",
  "ASSIGNED",
  "EN_ROUTE",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "SKIPPED",
  "NO_SHOW",
] as const;

export default async function JobsPage({ searchParams }: PageProps<"/admin/jobs">) {
  const ctx = await requireRole("/admin/login", "SUPER_ADMIN", "REGION_ADMIN");
  const p = await searchParams;
  const regions = await visibleRegions(ctx);
  const str = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : "");
  const today = todayIn("America/Toronto");
  const from = str("from") || today;
  const to = str("to") || addLocalDays(today, 14);
  const status = str("status");
  const regionId = str("region");
  const q = str("q");

  const jobs = await prisma.job.findMany({
    where: {
      ...regionWhere(ctx),
      ...(regionId ? { regionId } : {}),
      ...(status ? { status: status as (typeof STATUSES)[number] } : {}),
      scheduledDate: { gte: localDateToDateColumn(from), lte: localDateToDateColumn(to) },
      ...(q
        ? {
            OR: [
              { booking: { bookingNumber: { contains: q.toUpperCase() } } },
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
      booking: true,
      activeQuote: true,
      assignments: {
        where: { status: { in: ["ACCEPTED", "OFFERED"] } },
        include: { cleaner: true },
      },
    },
    orderBy: [{ scheduledDate: "asc" }, { windowStartLocal: "asc" }],
    take: 300,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Jobs</h1>
        <Link href="/admin/bookings/new" className={buttonVariants({ size: "sm" })}>
          New booking
        </Link>
      </div>
      <form className="flex flex-wrap items-end gap-2 text-sm">
        <label className="flex flex-col gap-1">
          From
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="h-8 rounded-lg border px-2"
          />
        </label>
        <label className="flex flex-col gap-1">
          To
          <input type="date" name="to" defaultValue={to} className="h-8 rounded-lg border px-2" />
        </label>
        <label className="flex flex-col gap-1">
          Status
          <select
            name="status"
            defaultValue={status}
            className="h-8 rounded-lg border bg-background px-2"
          >
            <option value="">Any</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Region
          <select
            name="region"
            defaultValue={regionId}
            className="h-8 rounded-lg border bg-background px-2"
          >
            <option value="">All</option>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Search
          <input
            name="q"
            defaultValue={q}
            placeholder="Booking # or customer"
            className="h-8 rounded-lg border px-2"
          />
        </label>
        <Button type="submit" size="sm" variant="outline">
          Filter
        </Button>
      </form>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Booking</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Service</TableHead>
            <TableHead>Region</TableHead>
            <TableHead>Cleaner</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Payment</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((j) => (
            <TableRow key={j.id}>
              <TableCell className="whitespace-nowrap">
                <Link href={`/admin/jobs/${j.id}`} className="underline-offset-2 hover:underline">
                  {dateColumnToLocalDate(j.scheduledDate)} {j.windowStartLocal}
                </Link>
              </TableCell>
              <TableCell className="font-mono text-xs">{j.booking.bookingNumber}</TableCell>
              <TableCell>
                {j.customer.firstName} {j.customer.lastName}
              </TableCell>
              <TableCell>{j.service.name}</TableCell>
              <TableCell>{j.region.name}</TableCell>
              <TableCell>
                {j.assignments
                  .map((a) => `${a.cleaner.firstName} ${a.cleaner.lastName[0]}.`)
                  .join(", ") || <span className="text-amber-700">Unassigned</span>}
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
          {jobs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-muted-foreground">
                No jobs match.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
