import {
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
} from "@mantine/core";
import type { Prisma } from "@/generated/prisma/client";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/mantine/page-header";
import { SortTh } from "@/components/admin/mantine/sort-th";
import { StatusPill } from "@/components/admin/mantine/status-badge";
import { FilterBar, Pager, SearchFilter, SelectFilter } from "@/components/admin/mantine/url-state";
import { buttonVariants } from "@/components/ui/button";
import {
  PAGE_SIZE,
  oneOf,
  pageParam,
  param,
  skipTake,
  sortParam,
} from "@/modules/admin/list-params";
import { visibleRegions } from "@/modules/admin/regions";
import { requireRole } from "@/modules/auth/session";
import { prisma } from "@/modules/db/client";
import { regionWhere } from "@/modules/db/scoped";
import { dateColumnToLocalDate } from "@/modules/shared/dates";
import { locale } from "@/modules/shared/country";

export const dynamic = "force-dynamic";

const STATUSES = ["ACTIVE", "PAUSED", "PENDING", "CANCELLED", "COMPLETED"] as const;
const FREQUENCIES = ["ONE_TIME", "WEEKLY", "BIWEEKLY", "EVERY_4_WEEKS"] as const;
const FREQ: Record<(typeof FREQUENCIES)[number], string> = {
  ONE_TIME: "One-time",
  WEEKLY: "Weekly",
  BIWEEKLY: "Bi-weekly",
  EVERY_4_WEEKS: "Every 4 wks",
};
const SORTS = ["created", "number", "customer", "status"] as const;
const label = (s: string) => s.charAt(0) + s.slice(1).replaceAll("_", " ").toLowerCase();

export default async function BookingsPage({ searchParams }: PageProps<"/admin/bookings">) {
  const ctx = await requireRole("/admin/login", "SUPER_ADMIN", "REGION_ADMIN");
  const p = await searchParams;
  const status = oneOf(p, "status", STATUSES);
  const frequency = oneOf(p, "frequency", FREQUENCIES);
  const regionId = param(p, "region");
  const q = param(p, "q").trim();
  const page = pageParam(p);
  const sort = sortParam(p, SORTS, { key: "created", dir: "desc" });

  const where: Prisma.BookingWhereInput = {
    ...regionWhere(ctx),
    ...(regionId ? { regionId } : {}),
    ...(status ? { status } : {}),
    ...(frequency ? { frequency } : {}),
    ...(q
      ? {
          OR: [
            { bookingNumber: { contains: q.toUpperCase() } },
            {
              customer: {
                OR: [
                  { firstName: { contains: q, mode: "insensitive" } },
                  { lastName: { contains: q, mode: "insensitive" } },
                  { email: { contains: q, mode: "insensitive" } },
                  { phone: { contains: q } },
                ],
              },
            },
          ],
        }
      : {}),
  };
  const orderBy: Prisma.BookingOrderByWithRelationInput[] = {
    created: [{ createdAt: sort.dir }],
    number: [{ bookingNumber: sort.dir }],
    customer: [{ customer: { lastName: sort.dir } }, { customer: { firstName: sort.dir } }],
    status: [{ status: sort.dir }, { createdAt: "desc" as const }],
  }[sort.key];

  const [regions, total, bookings] = await Promise.all([
    visibleRegions(ctx),
    prisma.booking.count({ where }),
    prisma.booking.findMany({
      where,
      orderBy,
      ...skipTake(page),
      select: {
        id: true,
        bookingNumber: true,
        status: true,
        frequency: true,
        createdAt: true,
        customer: { select: { firstName: true, lastName: true, email: true } },
        service: { select: { name: true } },
        region: { select: { name: true } },
        window: { select: { label: true } },
        _count: { select: { jobs: true } },
        jobs: {
          where: { status: { in: ["CONFIRMED", "ASSIGNED", "PENDING"] } },
          orderBy: { scheduledDate: "asc" },
          take: 1,
          select: { scheduledDate: true },
        },
      },
    }),
  ]);

  const dateLabel = (d: Date) =>
    new Date(`${dateColumnToLocalDate(d)}T12:00:00`).toLocaleDateString(locale, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  const th = { path: "/admin/bookings", params: p, current: sort };

  return (
    <Stack gap="lg">
      <PageHeader
        title="Bookings"
        description={`${total.toLocaleString()} booking${total === 1 ? "" : "s"}`}
        actions={
          <Link href="/admin/bookings/new" className={buttonVariants({ size: "sm" })}>
            New booking
          </Link>
        }
      />

      <Suspense>
        <FilterBar active={!!(status || frequency || regionId || q)}>
          <SearchFilter value={q} placeholder="Booking #, name, email, phone" />
          <SelectFilter
            param="status"
            label="Status"
            value={status}
            data={STATUSES.map((s) => ({ value: s, label: label(s) }))}
          />
          <SelectFilter
            param="frequency"
            label="Frequency"
            value={frequency}
            data={FREQUENCIES.map((f) => ({ value: f, label: FREQ[f] }))}
          />
          {regions.length > 1 ? (
            <SelectFilter
              param="region"
              label="Region"
              placeholder="All"
              value={regionId}
              data={regions.map((r) => ({ value: r.id, label: r.name }))}
              searchable
            />
          ) : null}
        </FilterBar>
      </Suspense>

      <Paper p={0}>
        <TableScrollContainer minWidth={900}>
          <Table stickyHeader striped>
            <TableThead>
              <TableTr>
                <SortTh {...th} sortKey="number">
                  Booking
                </SortTh>
                <SortTh {...th} sortKey="customer">
                  Customer
                </SortTh>
                <TableTh>Service</TableTh>
                <TableTh>Frequency</TableTh>
                <TableTh>Region</TableTh>
                <TableTh>Next visit</TableTh>
                <TableTh ta="right">Visits</TableTh>
                <SortTh {...th} sortKey="status">
                  Status
                </SortTh>
                <SortTh {...th} sortKey="created" firstDir="desc">
                  Created
                </SortTh>
              </TableTr>
            </TableThead>
            <TableTbody>
              {bookings.map((b) => (
                <TableTr key={b.id}>
                  <TableTd>
                    <Link
                      href={`/admin/bookings/${b.id}`}
                      className="font-mono text-xs font-medium hover:underline"
                    >
                      {b.bookingNumber}
                    </Link>
                  </TableTd>
                  <TableTd>
                    <Text size="sm">
                      {b.customer.firstName} {b.customer.lastName}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {b.customer.email}
                    </Text>
                  </TableTd>
                  <TableTd>{b.service.name}</TableTd>
                  <TableTd>
                    <Text size="sm">{FREQ[b.frequency]}</Text>
                    <Text size="xs" c="dimmed">
                      {b.window.label}
                    </Text>
                  </TableTd>
                  <TableTd>{b.region.name}</TableTd>
                  <TableTd style={{ whiteSpace: "nowrap" }}>
                    {b.jobs[0] ? dateLabel(b.jobs[0].scheduledDate) : <Text c="dimmed">—</Text>}
                  </TableTd>
                  <TableTd ta="right" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {b._count.jobs}
                  </TableTd>
                  <TableTd>
                    <StatusPill status={b.status} />
                  </TableTd>
                  <TableTd style={{ whiteSpace: "nowrap" }}>
                    <Text size="sm" c="dimmed">
                      {b.createdAt.toLocaleDateString(locale)}
                    </Text>
                  </TableTd>
                </TableTr>
              ))}
              {bookings.length === 0 ? (
                <TableTr>
                  <TableTd colSpan={9}>
                    <Text ta="center" c="dimmed" py="xl">
                      No bookings match these filters.
                    </Text>
                  </TableTd>
                </TableTr>
              ) : null}
            </TableTbody>
          </Table>
        </TableScrollContainer>
      </Paper>

      <Suspense>
        <Pager page={page} pageSize={PAGE_SIZE} total={total} />
      </Suspense>
    </Stack>
  );
}
