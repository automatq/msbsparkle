import {
  Alert,
  Anchor,
  Divider,
  Grid,
  GridCol,
  Group,
  Paper,
  Stack,
  Text,
  Timeline,
  TimelineItem,
  Title,
} from "@mantine/core";
import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import {
  AssignPanel,
  CancelPanel,
  NotePanel,
  PaymentPanel,
  ReschedulePanel,
  StatusPanel,
  SuggestPanel,
  UnassignButton,
} from "@/components/admin/mantine/job-detail";
import { StatusPill } from "@/components/admin/mantine/status-badge";
import { assertRegionAccess, requireRole } from "@/modules/auth/session";
import { isLateCancel, lateCancelFeeCents } from "@/modules/bookings/cancel";
import { prisma } from "@/modules/db/client";
import { isStripeConfigured } from "@/modules/payments/stripe";
import { suggestCleaners } from "@/modules/scheduling/dispatch";
import type { QuoteLine } from "@/modules/pricing/types";
import { dateColumnToLocalDate, formatInZone } from "@/modules/shared/dates";
import { formatCents } from "@/modules/shared/money";

export const dynamic = "force-dynamic";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Paper p="md">
      <Title order={2} fz="md" fw={600} mb="sm">
        {title}
      </Title>
      {children}
    </Paper>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Text size="sm">
      <Text span size="xs" c="dimmed">
        {label}:
      </Text>{" "}
      {children}
    </Text>
  );
}

export default async function JobPage({ params }: PageProps<"/admin/jobs/[id]">) {
  const ctx = await requireRole("/admin/login", "SUPER_ADMIN", "REGION_ADMIN");
  const { id } = await params;
  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      customer: true,
      service: true,
      region: { include: { windows: { where: { active: true }, orderBy: { sortOrder: "asc" } } } },
      booking: { include: { window: true, address: true } },
      activeQuote: true,
      assignments: { include: { cleaner: true }, orderBy: { createdAt: "asc" } },
      events: { orderBy: { createdAt: "desc" }, take: 50 },
      charges: { include: { refunds: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!job) notFound();
  try {
    assertRegionAccess(ctx, job.regionId);
  } catch {
    return (
      <Alert color="red" icon={<ShieldAlert size={18} />} title="No access">
        You don&apos;t have access to this region.
      </Alert>
    );
  }
  const cleaners = await prisma.cleaner.findMany({
    where: {
      status: "ACTIVE",
      OR: [{ homeRegionId: job.regionId }, { regions: { some: { regionId: job.regionId } } }],
    },
    orderBy: { firstName: "asc" },
  });
  const suggestions = ["COMPLETED", "CANCELLED", "SKIPPED", "NO_SHOW"].includes(job.status)
    ? []
    : await suggestCleaners(job.id);
  const active = job.assignments.filter((a) => ["ACCEPTED", "OFFERED"].includes(a.status));
  const addr = job.addressSnapshot as {
    line1: string;
    line2?: string | null;
    city: string;
    postalCode: string;
    entryInstructions?: string | null;
    parkingInstructions?: string | null;
  };
  const lines = (job.activeQuote?.lines ?? []) as unknown as QuoteLine[];
  const late = isLateCancel(job, job.region);
  const open = !["COMPLETED", "CANCELLED", "SKIPPED", "NO_SHOW"].includes(job.status);
  const extras = job.extras as { slug: string; qty: number }[];

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start" gap="sm">
        <div>
          <Text size="xs" c="dimmed">
            <Link href="/admin/jobs" className="hover:underline">
              Jobs
            </Link>{" "}
            /{" "}
            <Link href={`/admin/bookings/${job.bookingId}`} className="hover:underline">
              {job.booking.bookingNumber}
            </Link>{" "}
            / visit #{job.sequenceNumber}
          </Text>
          <Title order={1} fz={24} fw={600}>
            {formatInZone(job.scheduledStartAt, job.timezone, "EEEE, MMMM d")} ·{" "}
            {job.windowStartLocal}–{job.windowEndLocal}
          </Title>
          <Group gap="xs" mt={6}>
            <span data-testid="job-status" data-status={job.status}>
              <StatusPill status={job.status} />
            </span>
            <span data-testid="job-payment-status" data-status={job.paymentStatus}>
              <StatusPill status={job.paymentStatus} />
            </span>
            {job.detached ? (
              <Text size="xs" c="dimmed">
                edited individually
              </Text>
            ) : null}
          </Group>
        </div>
        <div style={{ textAlign: "right" }}>
          <Text fz={24} fw={600} style={{ fontVariantNumeric: "tabular-nums" }}>
            {formatCents((job.activeQuote?.totalCents ?? 0) + job.tipCents)}
          </Text>
          <Text size="sm" c="dimmed">
            ~{Math.round((job.estimatedMinutes / 60) * 10) / 10}h · {job.region.name}
          </Text>
        </div>
      </Group>

      <Grid gap="lg">
        <GridCol span={{ base: 12, lg: 8 }}>
          <Stack gap="lg">
            <Section title="Cleaners">
              <Stack gap="sm">
                {active.length === 0 ? (
                  <Text size="sm" c="orange" fw={500}>
                    Unassigned
                  </Text>
                ) : null}
                {active.map((a) => (
                  <Paper key={a.id} px="sm" py={8}>
                    <Group justify="space-between" wrap="nowrap">
                      <div>
                        <Link
                          href={`/admin/cleaners/${a.cleanerId}`}
                          className="text-sm font-medium hover:underline"
                        >
                          {a.cleaner.firstName} {a.cleaner.lastName}
                        </Link>
                        <Text span size="xs" c="dimmed" ml="xs">
                          {a.role.toLowerCase()} · {a.status.toLowerCase()}
                        </Text>
                        {a.checkInAt ? (
                          <Text span size="xs" ml="xs">
                            in {formatInZone(a.checkInAt, job.timezone, "h:mm a")}
                          </Text>
                        ) : null}
                        {a.checkOutAt ? (
                          <Text span size="xs" ml="xs">
                            out {formatInZone(a.checkOutAt, job.timezone, "h:mm a")}
                          </Text>
                        ) : null}
                      </div>
                      {open ? <UnassignButton jobId={job.id} cleanerId={a.cleanerId} /> : null}
                    </Group>
                  </Paper>
                ))}
                {open ? <SuggestPanel jobId={job.id} suggestions={suggestions} /> : null}
                {open ? (
                  <AssignPanel
                    jobId={job.id}
                    cleaners={cleaners.map((c) => ({
                      id: c.id,
                      name: `${c.firstName} ${c.lastName}`,
                    }))}
                    assigned={active.map((a) => a.cleanerId)}
                  />
                ) : null}
              </Stack>
            </Section>

            <Section title="Status">
              <Stack gap="md">
                <StatusPanel jobId={job.id} status={job.status} />
                {open ? (
                  <>
                    <Divider label="Reschedule" labelPosition="left" />
                    <ReschedulePanel
                      jobId={job.id}
                      date={dateColumnToLocalDate(job.scheduledDate)}
                      windowId={
                        job.region.windows.find((w) => w.startLocal === job.windowStartLocal)?.id ??
                        null
                      }
                      windows={job.region.windows.map((w) => ({ id: w.id, label: w.label }))}
                    />
                    <Divider label="Cancel" labelPosition="left" />
                    <CancelPanel
                      jobId={job.id}
                      late={late}
                      feeCents={lateCancelFeeCents(job.region, job.activeQuote?.totalCents ?? 0)}
                      recurring={job.booking.frequency !== "ONE_TIME"}
                    />
                  </>
                ) : null}
              </Stack>
            </Section>

            <Section title="Payment">
              <PaymentPanel
                jobId={job.id}
                status={job.status}
                paymentStatus={job.paymentStatus}
                stripeConfigured={isStripeConfigured()}
                charges={job.charges.map((c) => ({
                  id: c.id,
                  type: c.type,
                  status: c.status,
                  amountCents: c.amountCents,
                  refundedCents: c.refunds
                    .filter((r) => r.status === "SUCCEEDED")
                    .reduce((s, r) => s + r.amountCents, 0),
                }))}
              />
            </Section>

            <Section title="Timeline">
              <Stack gap="md">
                <NotePanel jobId={job.id} />
                {job.events.length ? (
                  <Timeline bulletSize={12} lineWidth={2}>
                    {job.events.map((e) => (
                      <TimelineItem
                        key={e.id}
                        title={
                          <Text size="sm" fw={500}>
                            {e.type.charAt(0) + e.type.slice(1).replaceAll("_", " ").toLowerCase()}
                          </Text>
                        }
                      >
                        <Text size="xs" c="dimmed">
                          {formatInZone(e.createdAt, job.timezone, "MMM d, h:mm a")} ·{" "}
                          {e.actorType.toLowerCase()}
                        </Text>
                        {summarize(e.data as Record<string, unknown>) ? (
                          <Text size="sm">{summarize(e.data as Record<string, unknown>)}</Text>
                        ) : null}
                      </TimelineItem>
                    ))}
                  </Timeline>
                ) : null}
              </Stack>
            </Section>
          </Stack>
        </GridCol>

        <GridCol span={{ base: 12, lg: 4 }}>
          <Stack gap="lg">
            <Section title="Customer">
              <Stack gap={4}>
                <Link
                  href={`/admin/customers/${job.customerId}`}
                  className="text-sm font-medium hover:underline"
                >
                  {job.customer.firstName} {job.customer.lastName}
                </Link>
                <Anchor href={`mailto:${job.customer.email}`} size="sm" c="dimmed">
                  {job.customer.email}
                </Anchor>
                {job.customer.phone ? (
                  <Anchor href={`tel:${job.customer.phone}`} size="sm" c="dimmed">
                    {job.customer.phone}
                  </Anchor>
                ) : null}
                <Text size="sm" mt="xs">
                  {addr.line1}
                  {addr.line2 ? `, ${addr.line2}` : ""}
                  <br />
                  {addr.city} {addr.postalCode}
                </Text>
                {addr.entryInstructions ? (
                  <Field label="Entry">{addr.entryInstructions}</Field>
                ) : null}
                {addr.parkingInstructions ? (
                  <Field label="Parking">{addr.parkingInstructions}</Field>
                ) : null}
                {job.customerNotes ? (
                  <Field label="Customer notes">{job.customerNotes}</Field>
                ) : null}
                {job.internalNotes ? <Field label="Internal">{job.internalNotes}</Field> : null}
              </Stack>
            </Section>

            <Section title="Service">
              <Stack gap={4}>
                <Text size="sm" fw={500}>
                  {job.service.name}
                  {job.isFirstCleanUpgrade ? " (first-clean upgrade)" : ""}
                </Text>
                <Text size="sm" c="dimmed">
                  {job.bedrooms} bd · {job.bathrooms.toString()} ba
                  {job.sqft ? ` · ${job.sqft} sq ft` : ""}
                </Text>
                {extras.length ? (
                  <Text size="sm" c="dimmed">
                    Extras:{" "}
                    {extras.map((e) => `${e.slug}${e.qty > 1 ? ` ×${e.qty}` : ""}`).join(", ")}
                  </Text>
                ) : null}
                <Stack gap={2} mt="xs">
                  {lines.map((l, i) => (
                    <Group key={i} justify="space-between" gap="xs">
                      <Text size="xs" c="dimmed">
                        {l.label}
                      </Text>
                      <Text size="xs" style={{ fontVariantNumeric: "tabular-nums" }}>
                        {formatCents(l.amountCents)}
                      </Text>
                    </Group>
                  ))}
                  <Divider my={4} />
                  <Group justify="space-between">
                    <Text size="sm" fw={600}>
                      Total
                    </Text>
                    <Text size="sm" fw={600} style={{ fontVariantNumeric: "tabular-nums" }}>
                      {formatCents(job.activeQuote?.totalCents ?? 0)}
                    </Text>
                  </Group>
                  {job.tipCents ? (
                    <Group justify="space-between">
                      <Text size="xs">Tip</Text>
                      <Text size="xs">{formatCents(job.tipCents)}</Text>
                    </Group>
                  ) : null}
                </Stack>
              </Stack>
            </Section>
          </Stack>
        </GridCol>
      </Grid>
    </Stack>
  );
}

function summarize(d: Record<string, unknown>): string {
  if (typeof d.note === "string") return d.note;
  if (d.from && d.to) return `${d.from} → ${d.to}${d.reason ? ` (${d.reason})` : ""}`;
  if (d.cleanerId)
    return `cleaner ${String(d.cleanerId).slice(-6)}${d.status ? ` ${d.status}` : ""}${d.reason ? ` (${d.reason})` : ""}`;
  if (d.after && typeof d.after === "object")
    return `to ${(d.after as { scheduledDate?: string }).scheduledDate ?? ""} ${(d.after as { windowStartLocal?: string }).windowStartLocal ?? ""}`;
  if (d.status) return String(d.status);
  return Object.keys(d).length ? JSON.stringify(d).slice(0, 80) : "";
}
