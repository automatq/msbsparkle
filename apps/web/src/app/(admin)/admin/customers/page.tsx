import {
  Badge,
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
} from "@mantine/core";
import type { Prisma } from "@/generated/prisma/client";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/mantine/page-header";
import { SortTh } from "@/components/admin/mantine/sort-th";
import { FilterBar, Pager, SearchFilter, SelectFilter } from "@/components/admin/mantine/url-state";
import { PAGE_SIZE, pageParam, param, skipTake, sortParam } from "@/modules/admin/list-params";
import { visibleRegions } from "@/modules/admin/regions";
import { requireRole } from "@/modules/auth/session";
import { prisma } from "@/modules/db/client";
import { regionWhere } from "@/modules/db/scoped";
import { locale } from "@/modules/shared/country";

export const dynamic = "force-dynamic";

const SORTS = ["name", "created", "bookings"] as const;

export default async function CustomersPage({ searchParams }: PageProps<"/admin/customers">) {
  const ctx = await requireRole("/admin/login", "SUPER_ADMIN", "REGION_ADMIN");
  const p = await searchParams;
  const q = param(p, "q").trim();
  const regionId = param(p, "region");
  const page = pageParam(p);
  const sort = sortParam(p, SORTS, { key: "created", dir: "desc" });

  const where: Prisma.CustomerWhereInput = {
    organizationId: ctx.orgId,
    ...(ctx.isSuperAdmin ? {} : { bookings: { some: regionWhere(ctx) } }),
    ...(regionId ? { addresses: { some: { regionId, isDefault: true } } } : {}),
    ...(q
      ? {
          OR: [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
          ],
        }
      : {}),
  };
  const orderBy: Prisma.CustomerOrderByWithRelationInput[] = {
    name: [{ lastName: sort.dir }, { firstName: sort.dir }],
    created: [{ createdAt: sort.dir }],
    bookings: [{ bookings: { _count: sort.dir } }, { createdAt: "desc" as const }],
  }[sort.key];

  const [regions, total, customers] = await Promise.all([
    visibleRegions(ctx),
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      orderBy,
      ...skipTake(page),
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        tags: true,
        anonymizedAt: true,
        createdAt: true,
        _count: { select: { bookings: true, jobs: true } },
        addresses: {
          where: { isDefault: true },
          take: 1,
          select: { region: { select: { name: true } } },
        },
      },
    }),
  ]);
  const th = { path: "/admin/customers", params: p, current: sort };

  return (
    <Stack gap="lg">
      <PageHeader
        title="Customers"
        description={`${total.toLocaleString()} customer${total === 1 ? "" : "s"}`}
      />

      <Suspense>
        <FilterBar active={!!(q || regionId)}>
          <SearchFilter value={q} placeholder="Name, email or phone" />
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
        <TableScrollContainer minWidth={760}>
          <Table stickyHeader striped>
            <TableThead>
              <TableTr>
                <SortTh {...th} sortKey="name">
                  Name
                </SortTh>
                <TableTh>Phone</TableTh>
                <TableTh>Region</TableTh>
                <SortTh {...th} sortKey="bookings" firstDir="desc" ta="right">
                  Bookings
                </SortTh>
                <TableTh ta="right">Visits</TableTh>
                <SortTh {...th} sortKey="created" firstDir="desc">
                  Since
                </SortTh>
              </TableTr>
            </TableThead>
            <TableTbody>
              {customers.map((c) => (
                <TableTr key={c.id}>
                  <TableTd>
                    <Group gap={6} wrap="nowrap">
                      <Link
                        href={`/admin/customers/${c.id}`}
                        className="font-medium hover:underline"
                      >
                        {c.firstName} {c.lastName}
                      </Link>
                      {c.anonymizedAt ? (
                        <Badge size="xs" color="gray" variant="light" tt="none">
                          Anonymized
                        </Badge>
                      ) : null}
                      {c.tags.slice(0, 3).map((t) => (
                        <Badge key={t} size="xs" variant="outline" color="gray" tt="none">
                          {t}
                        </Badge>
                      ))}
                    </Group>
                    <Text size="xs" c="dimmed">
                      {c.email}
                    </Text>
                  </TableTd>
                  <TableTd style={{ whiteSpace: "nowrap" }}>
                    {c.phone ?? <Text c="dimmed">—</Text>}
                  </TableTd>
                  <TableTd>{c.addresses[0]?.region.name ?? <Text c="dimmed">—</Text>}</TableTd>
                  <TableTd ta="right" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {c._count.bookings}
                  </TableTd>
                  <TableTd ta="right" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {c._count.jobs}
                  </TableTd>
                  <TableTd style={{ whiteSpace: "nowrap" }}>
                    <Text size="sm" c="dimmed">
                      {c.createdAt.toLocaleDateString(locale)}
                    </Text>
                  </TableTd>
                </TableTr>
              ))}
              {customers.length === 0 ? (
                <TableTr>
                  <TableTd colSpan={6}>
                    <Text ta="center" c="dimmed" py="xl">
                      {q || regionId ? "No customers match these filters." : "No customers yet."}
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
