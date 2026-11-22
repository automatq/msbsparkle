import {
  Alert,
  Paper,
  SimpleGrid,
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
import type { Prisma } from "@/generated/prisma/client";
import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/mantine/page-header";
import { SortTh } from "@/components/admin/mantine/sort-th";
import { StatusPill } from "@/components/admin/mantine/status-badge";
import { FilterBar, Pager, SearchFilter, SelectFilter } from "@/components/admin/mantine/url-state";
import {
  PAGE_SIZE,
  oneOf,
  pageParam,
  param,
  skipTake,
  sortParam,
} from "@/modules/admin/list-params";
import { requireRole } from "@/modules/auth/session";
import { prisma } from "@/modules/db/client";
import { regionWhere } from "@/modules/db/scoped";
import { isStripeConfigured } from "@/modules/payments/stripe";
import { dateColumnToLocalDate } from "@/modules/shared/dates";
import { formatCents } from "@/modules/shared/money";
import { locale } from "@/modules/shared/country";

export const dynamic = "force-dynamic";

const STATUSES = [
  "PENDING",
  "AUTHORIZED",
  "REQUIRES_ACTION",
  "CAPTURED",
  "FAILED",
  "FAILED_FINAL",
  "CANCELED",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
  "DISPUTED",
  "WAIVED",
] as const;
const TYPES = ["SERVICE", "TIP", "CANCELLATION_FEE", "GIFT_CARD_PURCHASE", "ADJUSTMENT"] as const;
const SORTS = ["date", "amount"] as const;
const DUE_LIMIT = 100;
/** Start of the "last N days" window for the summary cards (per request, so outside render). */
function daysAgo(n: number) {
  return new Date(Date.now() - n * 86_400_000);
}

const label = (s: string) => s.charAt(0) + s.slice(1).replaceAll("_", " ").toLowerCase();

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <Paper p="md">
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {label}
      </Text>
      <Text fz={26} fw={600} c={tone} style={{ fontVariantNumeric: "tabular-nums" }}>
        {value}
      </Text>
      {hint ? (
        <Text size="xs" c="dimmed">
          {hint}
        </Text>
      ) : null}
    </Paper>
  );
}

export default async function PaymentsPage({ searchParams }: PageProps<"/admin/payments">) {
  const ctx = await requireRole("/admin/login", "SUPER_ADMIN", "REGION_ADMIN");
  const p = await searchParams;
  const scope = regionWhere(ctx);
  const status = oneOf(p, "status", STATUSES);
  const type = oneOf(p, "type", TYPES);
  const q = param(p, "q").trim();
  const page = pageParam(p);
  const sort = sortParam(p, SORTS, { key: "date", dir: "desc" });
  const since = daysAgo(30);

  // Same visibility as before: charges on visits in the admin's regions, plus charges with no
  // visit (e.g. gift card purchases).
  const visible: Prisma.ChargeWhereInput = {
    organizationId: ctx.orgId,
    OR: [{ job: scope }, { jobId: null }],
  };
  const where: Prisma.ChargeWhereInput = {
    AND: [
      visible,
      status ? { status } : {},
      type ? { type } : {},
      q
        ? {
            OR: [
              { job: { booking: { bookingNumber: { contains: q.toUpperCase() } } } },
              { customer: { lastName: { contains: q, mode: "insensitive" } } },
              { customer: { email: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {},
    ],
  };
  const dueWhere: Prisma.JobWhereInput = {
    ...scope,
    status: "COMPLETED",
    paymentStatus: { in: ["UNPAID", "FAILED"] },
  };

  const [dueCount, due, collected, failed, refunded, total, charges] = await Promise.all([
    prisma.job.count({ where: dueWhere }),
    prisma.job.findMany({
      where: dueWhere,
      select: {
        id: true,
        scheduledDate: true,
        paymentStatus: true,
        tipCents: true,
        customer: { select: { firstName: true, lastName: true } },
        booking: { select: { bookingNumber: true } },
        region: { select: { name: true } },
        activeQuote: { select: { totalCents: true } },
      },
      orderBy: { completedAt: "asc" },
      take: DUE_LIMIT,
    }),
    prisma.charge.aggregate({
      where: {
        AND: [
          visible,
          { status: { in: ["CAPTURED", "PARTIALLY_REFUNDED"] }, createdAt: { gte: since } },
        ],
      },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
    prisma.charge.count({
      where: {
        AND: [
          visible,
          {
            status: { in: ["FAILED", "FAILED_FINAL", "REQUIRES_ACTION"] },
            createdAt: { gte: since },
          },
        ],
      },
    }),
    prisma.refund.aggregate({
      where: { status: "SUCCEEDED", createdAt: { gte: since }, charge: visible },
      _sum: { amountCents: true },
    }),
    prisma.charge.count({ where }),
    prisma.charge.findMany({
      where,
      orderBy: sort.key === "amount" ? [{ amountCents: sort.dir }] : [{ createdAt: sort.dir }],
      ...skipTake(page),
      select: {
        id: true,
        createdAt: true,
        type: true,
        status: true,
        amountCents: true,
        failureMessage: true,
        customer: { select: { id: true, firstName: true, lastName: true } },
        job: { select: { id: true, booking: { select: { bookingNumber: true } } } },
        refunds: { where: { status: "SUCCEEDED" }, select: { amountCents: true } },
      },
    }),
  ]);

  const dueCents = due.reduce((s, j) => s + (j.activeQuote?.totalCents ?? 0) + j.tipCents, 0);
  const th = { path: "/admin/payments", params: p, current: sort };
  const money = { fontVariantNumeric: "tabular-nums" } as const;

  return (
    <Stack gap="lg">
      <PageHeader title="Payments" description="Cards are charged after each visit is completed." />

      {!isStripeConfigured() ? (
        <Alert color="yellow" variant="light" icon={<TriangleAlert size={18} />}>
          Stripe is not configured; charges cannot be collected in this environment.
        </Alert>
      ) : null}

      <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }}>
        <Stat
          label="Awaiting charge"
          value={dueCount > DUE_LIMIT ? `${formatCents(dueCents)}+` : formatCents(dueCents)}
          hint={`${dueCount} completed visit${dueCount === 1 ? "" : "s"}`}
          tone={dueCount ? "orange" : undefined}
        />
        <Stat
          label="Collected, 30 days"
          value={formatCents(collected._sum.amountCents ?? 0)}
          hint={`${collected._count._all} charge${collected._count._all === 1 ? "" : "s"}`}
        />
        <Stat
          label="Failed, 30 days"
          value={String(failed)}
          hint="Failed or needs card action"
          tone={failed ? "red" : undefined}
        />
        <Stat label="Refunded, 30 days" value={formatCents(refunded._sum.amountCents ?? 0)} />
      </SimpleGrid>

      <Stack gap="xs">
        <Title order={2} fz="lg" fw={600}>
          Completed, awaiting charge
        </Title>
        <Paper p={0}>
          <TableScrollContainer minWidth={700}>
            <Table striped>
              <TableThead>
                <TableTr>
                  <TableTh>Visit</TableTh>
                  <TableTh>Booking</TableTh>
                  <TableTh>Customer</TableTh>
                  <TableTh>Region</TableTh>
                  <TableTh>Payment</TableTh>
                  <TableTh ta="right">Amount</TableTh>
                </TableTr>
              </TableThead>
              <TableTbody>
                {due.map((j) => (
                  <TableTr key={j.id}>
                    <TableTd style={{ whiteSpace: "nowrap" }}>
                      <Link href={`/admin/jobs/${j.id}`} className="font-medium hover:underline">
                        {dateColumnToLocalDate(j.scheduledDate)}
                      </Link>
                    </TableTd>
                    <TableTd>
                      <Text span ff="monospace" size="xs">
                        {j.booking.bookingNumber}
                      </Text>
                    </TableTd>
                    <TableTd>
                      {j.customer.firstName} {j.customer.lastName}
                    </TableTd>
                    <TableTd>{j.region.name}</TableTd>
                    <TableTd>
                      <StatusPill status={j.paymentStatus} />
                    </TableTd>
                    <TableTd ta="right" style={money}>
                      {formatCents((j.activeQuote?.totalCents ?? 0) + j.tipCents)}
                    </TableTd>
                  </TableTr>
                ))}
                {due.length === 0 ? (
                  <TableTr>
                    <TableTd colSpan={6}>
                      <Text ta="center" c="dimmed" py="lg">
                        Nothing outstanding.
                      </Text>
                    </TableTd>
                  </TableTr>
                ) : null}
              </TableTbody>
            </Table>
          </TableScrollContainer>
        </Paper>
        {dueCount > DUE_LIMIT ? (
          <Text size="xs" c="dimmed">
            Showing the oldest {DUE_LIMIT} of {dueCount}.
          </Text>
        ) : null}
      </Stack>

      <Stack gap="xs">
        <Title order={2} fz="lg" fw={600}>
          Charges
        </Title>
        <Suspense>
          <FilterBar active={!!(status || type || q)}>
            <SearchFilter value={q} placeholder="Booking #, last name, email" />
            <SelectFilter
              param="status"
              label="Status"
              value={status}
              data={STATUSES.map((s) => ({ value: s, label: label(s) }))}
            />
            <SelectFilter
              param="type"
              label="Type"
              value={type}
              data={TYPES.map((t) => ({ value: t, label: label(t) }))}
            />
          </FilterBar>
        </Suspense>
        <Paper p={0}>
          <TableScrollContainer minWidth={820}>
            <Table stickyHeader striped>
              <TableThead>
                <TableTr>
                  <SortTh {...th} sortKey="date" firstDir="desc">
                    Date
                  </SortTh>
                  <TableTh>Type</TableTh>
                  <TableTh>Customer</TableTh>
                  <TableTh>Booking</TableTh>
                  <TableTh>Status</TableTh>
                  <SortTh {...th} sortKey="amount" firstDir="desc" ta="right">
                    Amount
                  </SortTh>
                  <TableTh ta="right">Refunded</TableTh>
                </TableTr>
              </TableThead>
              <TableTbody>
                {charges.map((c) => {
                  const refundedCents = c.refunds.reduce((s, r) => s + r.amountCents, 0);
                  return (
                    <TableTr key={c.id}>
                      <TableTd style={{ whiteSpace: "nowrap" }}>
                        {c.createdAt.toLocaleDateString(locale)}
                      </TableTd>
                      <TableTd>{label(c.type)}</TableTd>
                      <TableTd>
                        <Link
                          href={`/admin/customers/${c.customer.id}`}
                          className="hover:underline"
                        >
                          {c.customer.firstName} {c.customer.lastName}
                        </Link>
                      </TableTd>
                      <TableTd>
                        {c.job ? (
                          <Link
                            href={`/admin/jobs/${c.job.id}`}
                            className="font-mono text-xs hover:underline"
                          >
                            {c.job.booking.bookingNumber}
                          </Link>
                        ) : (
                          <Text c="dimmed">—</Text>
                        )}
                      </TableTd>
                      <TableTd>
                        <StatusPill status={c.status} />
                        {c.failureMessage ? (
                          <Text size="xs" c="red" mt={2}>
                            {c.failureMessage}
                          </Text>
                        ) : null}
                      </TableTd>
                      <TableTd ta="right" style={money}>
                        {formatCents(c.amountCents)}
                      </TableTd>
                      <TableTd ta="right" style={money} c={refundedCents ? undefined : "dimmed"}>
                        {refundedCents ? formatCents(refundedCents) : "—"}
                      </TableTd>
                    </TableTr>
                  );
                })}
                {charges.length === 0 ? (
                  <TableTr>
                    <TableTd colSpan={7}>
                      <Text ta="center" c="dimmed" py="lg">
                        {status || type || q
                          ? "No charges match these filters."
                          : "No charges yet."}
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
    </Stack>
  );
}
