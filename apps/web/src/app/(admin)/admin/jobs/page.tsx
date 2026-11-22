import {
  Group,
  Paper,
  Stack,
  Table,
  TableScrollContainer,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
  Title,
} from "@mantine/core";
import Link from "next/link";
import { Suspense } from "react";
import { JobFilters } from "@/components/admin/mantine/job-filters";
import { StatusPill } from "@/components/admin/mantine/status-badge";
import { buttonVariants } from "@/components/ui/button";
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
import { timezone } from "@/modules/shared/country";

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
  const today = todayIn(timezone);
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

  const dateLabel = (d: Date) =>
    new Date(`${dateColumnToLocalDate(d)}T12:00:00`).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <div>
          <Title order={1} fz={24} fw={600}>
            Jobs
          </Title>
          <Text size="sm" c="dimmed">
            {jobs.length === 300
              ? "First 300 visits"
              : `${jobs.length} visit${jobs.length === 1 ? "" : "s"}`}
          </Text>
        </div>
        <Link href="/admin/bookings/new" className={buttonVariants({ size: "sm" })}>
          New booking
        </Link>
      </Group>

      <Suspense>
        <JobFilters
          from={from}
          to={to}
          status={status}
          regionId={regionId}
          q={q}
          statuses={STATUSES}
          regions={regions.map((r) => ({ id: r.id, name: r.name }))}
          defaults={{ from: today, to: addLocalDays(today, 14) }}
        />
      </Suspense>

      <Paper p={0}>
        <TableScrollContainer minWidth={960}>
          <Table stickyHeader striped>
            <TableThead>
              <TableTr>
                <TableTh>When</TableTh>
                <TableTh>Booking</TableTh>
                <TableTh>Customer</TableTh>
                <TableTh>Service</TableTh>
                <TableTh>Region</TableTh>
                <TableTh>Cleaner</TableTh>
                <TableTh>Status</TableTh>
                <TableTh>Payment</TableTh>
                <TableTh ta="right">Total</TableTh>
              </TableTr>
            </TableThead>
            <TableTbody>
              {jobs.map((j) => (
                <TableTr key={j.id}>
                  <TableTd style={{ whiteSpace: "nowrap" }}>
                    <Link
                      href={`/admin/jobs/${j.id}`}
                      className="font-medium hover:underline"
                      data-date={dateColumnToLocalDate(j.scheduledDate)}
                    >
                      {dateLabel(j.scheduledDate)}
                    </Link>
                    <Text size="xs" c="dimmed">
                      {j.windowStartLocal}–{j.windowEndLocal}
                    </Text>
                  </TableTd>
                  <TableTd>
                    <Text span ff="monospace" size="xs">
                      {j.booking.bookingNumber}
                    </Text>
                  </TableTd>
                  <TableTd>
                    {j.customer.firstName} {j.customer.lastName}
                  </TableTd>
                  <TableTd>{j.service.name}</TableTd>
                  <TableTd>{j.region.name}</TableTd>
                  <TableTd>
                    {j.assignments
                      .map((a) => `${a.cleaner.firstName} ${a.cleaner.lastName[0]}.`)
                      .join(", ") || (
                      <Text span size="sm" c="orange.8" fw={500}>
                        Unassigned
                      </Text>
                    )}
                  </TableTd>
                  <TableTd>
                    <StatusPill status={j.status} />
                  </TableTd>
                  <TableTd>
                    <StatusPill status={j.paymentStatus} />
                  </TableTd>
                  <TableTd ta="right" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {formatCents(j.activeQuote?.totalCents ?? 0)}
                  </TableTd>
                </TableTr>
              ))}
              {jobs.length === 0 ? (
                <TableTr>
                  <TableTd colSpan={9}>
                    <Text ta="center" c="dimmed" py="xl">
                      No jobs match these filters.
                    </Text>
                  </TableTd>
                </TableTr>
              ) : null}
            </TableTbody>
          </Table>
        </TableScrollContainer>
      </Paper>
    </Stack>
  );
}
