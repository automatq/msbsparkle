import Link from "next/link";
import { StatusBadge } from "@/components/admin/ui";
import { buttonVariants } from "@/components/ui/button";
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
import { todayIn, localDateToDateColumn, addLocalDays } from "@/modules/shared/dates";

export const dynamic = "force-dynamic";

export default async function CleanersPage() {
  const ctx = await requireRole("/admin/login", "SUPER_ADMIN", "REGION_ADMIN");
  const today = todayIn("America/Toronto");
  const cleaners = await prisma.cleaner.findMany({
    where: {
      organizationId: ctx.orgId,
      ...(ctx.isSuperAdmin
        ? {}
        : {
            OR: [
              { homeRegionId: { in: ctx.regionIds } },
              { regions: { some: { regionId: { in: ctx.regionIds } } } },
            ],
          }),
    },
    include: {
      homeRegion: true,
      _count: {
        select: {
          assignments: {
            where: {
              status: "ACCEPTED",
              job: {
                scheduledDate: {
                  gte: localDateToDateColumn(today),
                  lte: localDateToDateColumn(addLocalDays(today, 7)),
                },
                status: { in: ["ASSIGNED", "EN_ROUTE", "IN_PROGRESS"] },
              },
            },
          },
        },
      },
    },
    orderBy: [{ status: "asc" }, { firstName: "asc" }],
  });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Cleaners</h1>
        <Link href="/admin/cleaners/new" className={buttonVariants({ size: "sm" })}>
          Add cleaner
        </Link>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Home region</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Background</TableHead>
            <TableHead>Pay</TableHead>
            <TableHead>Jobs next 7d</TableHead>
            <TableHead>Rating</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cleaners.map((c) => (
            <TableRow key={c.id}>
              <TableCell>
                <Link href={`/admin/cleaners/${c.id}`} className="font-medium hover:underline">
                  {c.firstName} {c.lastName}
                </Link>
                <div className="text-xs text-muted-foreground">{c.phone}</div>
              </TableCell>
              <TableCell>{c.homeRegion.name}</TableCell>
              <TableCell>
                <StatusBadge status={c.status} />
              </TableCell>
              <TableCell>{c.backgroundCheckStatus}</TableCell>
              <TableCell>
                {c.payType === "PERCENT_OF_JOB"
                  ? `${(c.payPercentBps ?? 0) / 100}%`
                  : c.payType === "HOURLY"
                    ? `$${((c.payRateCents ?? 0) / 100).toFixed(2)}/h`
                    : `$${((c.payRateCents ?? 0) / 100).toFixed(2)}/job`}
              </TableCell>
              <TableCell>{c._count.assignments}</TableCell>
              <TableCell>
                {c.ratingAvg ? `${c.ratingAvg.toString()} (${c.ratingCount})` : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
