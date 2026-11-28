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
import { PageHeader } from "@/components/admin/mantine/page-header";
import { CloneButton } from "@/components/admin/mantine/pricing-panels";
import { StatusPill } from "@/components/admin/mantine/status-badge";
import { requireRole } from "@/modules/auth/session";
import { prisma } from "@/modules/db/client";

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const ctx = await requireRole("/admin/login", "SUPER_ADMIN");
  const [tables, regions] = await Promise.all([
    prisma.pricingTable.findMany({
      where: { organizationId: ctx.orgId },
      include: { region: true, _count: { select: { rates: true, quotes: true } } },
      orderBy: [{ regionId: "asc" }, { version: "desc" }],
    }),
    prisma.region.findMany({ where: { organizationId: ctx.orgId }, orderBy: { name: "asc" } }),
  ]);
  const orgDefault = tables.find((t) => !t.regionId && t.status === "PUBLISHED");
  const withoutOverride = regions.filter((r) => !tables.some((t) => t.regionId === r.id));

  return (
    <Stack gap="lg">
      <PageHeader
        title="Pricing"
        description="Rate sheets are versioned. Published tables can't be edited: clone one to a draft, edit it, then publish. A region's table overrides the organization default row by row."
      />
      <Paper p={0}>
        <TableScrollContainer minWidth={820}>
          <Table data-testid="pricing-tables">
            <TableThead>
              <TableTr>
                <TableTh>Scope</TableTh>
                <TableTh>Version</TableTh>
                <TableTh>Status</TableTh>
                <TableTh>Effective</TableTh>
                <TableTh ta="right">Rates</TableTh>
                <TableTh ta="right">Quotes</TableTh>
                <TableTh>Notes</TableTh>
                <TableTh />
              </TableTr>
            </TableThead>
            <TableTbody>
              {tables.map((t) => (
                <TableTr key={t.id} data-status={t.status}>
                  <TableTd>
                    <Link href={`/admin/pricing/${t.id}`} className="font-medium hover:underline">
                      {t.region ? t.region.name : "Organization default"}
                    </Link>
                  </TableTd>
                  <TableTd>v{t.version}</TableTd>
                  <TableTd>
                    <StatusPill status={t.status} />
                  </TableTd>
                  <TableTd style={{ whiteSpace: "nowrap" }}>
                    {t.effectiveFrom.toISOString().slice(0, 10)}
                  </TableTd>
                  <TableTd ta="right">{t._count.rates}</TableTd>
                  <TableTd ta="right">{t._count.quotes}</TableTd>
                  <TableTd>
                    <Text size="xs" c="dimmed">
                      {t.notes}
                    </Text>
                  </TableTd>
                  <TableTd ta="right">
                    <CloneButton tableId={t.id} />
                  </TableTd>
                </TableTr>
              ))}
            </TableTbody>
          </Table>
        </TableScrollContainer>
      </Paper>

      {orgDefault && withoutOverride.length ? (
        <Stack gap="xs">
          <Title order={2} fz="md" fw={600}>
            Create a region override
          </Title>
          <Text size="sm" c="dimmed">
            These regions use the organization default (v{orgDefault.version}). Start a draft from
            it to give a region its own prices.
          </Text>
          <Group gap="xs">
            {withoutOverride.map((r) => (
              <CloneButton
                key={r.id}
                tableId={orgDefault.id}
                regionId={r.id}
                label={`${r.name} draft`}
              />
            ))}
          </Group>
        </Stack>
      ) : null}

      <Text size="sm" c="dimmed">
        Prices are shown before tax. Tax rates are managed on the{" "}
        <Link href="/admin/taxes" className="underline">
          Taxes
        </Link>{" "}
        page.
      </Text>
    </Stack>
  );
}
