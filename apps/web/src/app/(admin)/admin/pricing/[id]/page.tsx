import {
  Code,
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
import { notFound } from "next/navigation";
import { PublishPanel, RateCell } from "@/components/admin/mantine/pricing-panels";
import { StatusPill } from "@/components/admin/mantine/status-badge";
import { requireRole } from "@/modules/auth/session";
import { prisma } from "@/modules/db/client";

export const dynamic = "force-dynamic";

const KIND_ORDER = [
  "BASE",
  "BEDROOM",
  "BATHROOM",
  "SQFT_BAND",
  "SERVICE_SURCHARGE",
  "FIRST_CLEAN_UPGRADE",
  "EXTRA",
  "HOURLY_RATE",
  "HOURLY_MIN",
  "FREQUENCY_DISCOUNT",
  "MIN_JOB",
];

const kindLabel = (k: string) => k.charAt(0) + k.slice(1).replaceAll("_", " ").toLowerCase();

export default async function PricingTablePage({ params }: PageProps<"/admin/pricing/[id]">) {
  const ctx = await requireRole("/admin/login", "SUPER_ADMIN");
  const { id } = await params;
  const t = await prisma.pricingTable.findUnique({
    where: { id },
    include: { region: true, rates: true },
  });
  if (!t || t.organizationId !== ctx.orgId) notFound();
  const editable = t.status === "DRAFT";
  const rates = [...t.rates].sort(
    (a, b) =>
      KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
      a.key.localeCompare(b.key, undefined, { numeric: true }),
  );
  const scope = t.region ? t.region.name : "Organization default";

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end" gap="sm">
        <div>
          <Text size="xs" c="dimmed">
            <Link href="/admin/pricing" className="hover:underline">
              Pricing
            </Link>
          </Text>
          <Group gap="sm" align="center">
            <Title order={1} fz={24} fw={600}>
              {scope} · v{t.version}
            </Title>
            <span data-testid="pricing-status" data-status={t.status}>
              <StatusPill status={t.status} />
            </span>
          </Group>
          <Text size="sm" c="dimmed">
            Effective {t.effectiveFrom.toISOString().slice(0, 10)}
            {t.notes ? ` · ${t.notes}` : ""}
          </Text>
        </div>
        <PublishPanel tableId={t.id} status={t.status} />
      </Group>

      <Paper p={0}>
        <TableScrollContainer minWidth={640}>
          <Table data-testid="pricing-rates">
            <TableThead>
              <TableTr>
                <TableTh>Kind</TableTh>
                <TableTh>Key</TableTh>
                <TableTh ta="right">Amount ($)</TableTh>
                <TableTh ta="right">Percent (%)</TableTh>
                <TableTh ta="right">Minutes</TableTh>
              </TableTr>
            </TableThead>
            <TableTbody>
              {rates.map((r) => {
                const name = `${kindLabel(r.kind)} ${r.key}`;
                return (
                  <TableTr key={r.id} data-kind={r.kind} data-key={r.key}>
                    <TableTd>
                      <Text size="sm">{kindLabel(r.kind)}</Text>
                    </TableTd>
                    <TableTd>
                      <Code fz="xs">{r.key}</Code>
                    </TableTd>
                    <TableTd ta="right">
                      <RateCell
                        tableId={t.id}
                        rateId={r.id}
                        field="amountCents"
                        value={r.amountCents}
                        label={`${name} amount`}
                        editable={
                          editable && r.kind !== "FREQUENCY_DISCOUNT" && r.kind !== "HOURLY_MIN"
                        }
                      />
                    </TableTd>
                    <TableTd ta="right">
                      <RateCell
                        tableId={t.id}
                        rateId={r.id}
                        field="bps"
                        value={r.bps}
                        label={`${name} percent`}
                        editable={editable && r.kind === "FREQUENCY_DISCOUNT"}
                        scale={100}
                        step={0.5}
                      />
                    </TableTd>
                    <TableTd ta="right">
                      <RateCell
                        tableId={t.id}
                        rateId={r.id}
                        field="minutes"
                        value={r.minutes}
                        label={`${name} minutes`}
                        editable={editable}
                        scale={1}
                        step={5}
                      />
                    </TableTd>
                  </TableTr>
                );
              })}
            </TableTbody>
          </Table>
        </TableScrollContainer>
      </Paper>
      {editable ? (
        <Text size="xs" c="dimmed">
          Each value saves when you leave the field. Publishing makes this version live; existing
          bookings keep the quote they were booked with.
        </Text>
      ) : null}
    </Stack>
  );
}
