import Link from "next/link";
import { notFound } from "next/navigation";
import { CleanerForm } from "@/components/admin/cleaner-form";
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
import { visibleRegions } from "@/modules/admin/regions";
import { assertRegionAccess, requireRole } from "@/modules/auth/session";
import { prisma } from "@/modules/db/client";
import {
  dateColumnToLocalDate,
  todayIn,
  localDateToDateColumn,
  addLocalDays,
} from "@/modules/shared/dates";
import { formatCents } from "@/modules/shared/money";

export const dynamic = "force-dynamic";

export default async function CleanerPage({ params }: PageProps<"/admin/cleaners/[id]">) {
  const ctx = await requireRole("/admin/login", "SUPER_ADMIN", "REGION_ADMIN");
  const { id } = await params;
  const today = todayIn("America/Toronto");
  const c = await prisma.cleaner.findUnique({
    where: { id },
    include: {
      regions: true,
      skills: true,
      availability: true,
      homeRegion: true,
      assignments: {
        where: {
          status: { in: ["ACCEPTED", "OFFERED"] },
          job: { scheduledDate: { gte: localDateToDateColumn(addLocalDays(today, -7)) } },
        },
        include: { job: { include: { customer: true, booking: true, activeQuote: true } } },
        orderBy: { job: { scheduledDate: "asc" } },
        take: 40,
      },
      earnings: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!c || c.organizationId !== ctx.orgId) notFound();
  try {
    assertRegionAccess(ctx, c.homeRegionId);
  } catch {
    return <p className="text-destructive">This cleaner belongs to another region.</p>;
  }
  const regions = await visibleRegions(ctx);
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-muted-foreground">
          <Link href="/admin/cleaners" className="hover:underline">
            Cleaners
          </Link>
        </p>
        <h1 className="flex items-center gap-3 text-2xl font-semibold">
          {c.firstName} {c.lastName} <StatusBadge status={c.status} />
        </h1>
        <p className="text-sm text-muted-foreground">
          {c.email} · {c.phone} · {c.homeRegion.name}
          {c.ratingAvg ? ` · ★ ${c.ratingAvg.toString()} (${c.ratingCount})` : ""}
        </p>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Upcoming & recent jobs</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Job total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {c.assignments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Link href={`/admin/jobs/${a.jobId}`} className="hover:underline">
                        {dateColumnToLocalDate(a.job.scheduledDate)} {a.job.windowStartLocal}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {a.job.customer.firstName} {a.job.customer.lastName[0]}. ·{" "}
                      {a.job.booking.bookingNumber}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={a.job.status} />
                      {a.status === "OFFERED" ? (
                        <span className="ml-1 text-xs">offered</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCents(a.job.activeQuote?.totalCents ?? 0)}
                    </TableCell>
                  </TableRow>
                ))}
                {c.assignments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No jobs in the last week or upcoming.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <CleanerForm
              regions={regions}
              initial={{
                id: c.id,
                firstName: c.firstName,
                lastName: c.lastName,
                email: c.email,
                phone: c.phone,
                homeRegionId: c.homeRegionId,
                regionIds: c.regions.map((r) => r.regionId).filter((r) => r !== c.homeRegionId),
                status: c.status,
                backgroundCheckStatus: c.backgroundCheckStatus,
                payType: c.payType,
                payRateCents: c.payRateCents,
                payPercentBps: c.payPercentBps,
                maxJobsPerDay: c.maxJobsPerDay,
                skills: c.skills.map((s) => s.skill),
                notes: c.notes ?? "",
                availability: c.availability.map((a) => ({
                  weekday: a.weekday,
                  startLocal: a.startLocal,
                  endLocal: a.endLocal,
                })),
              }}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
