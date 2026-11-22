"use client";

import {
  Button,
  Checkbox,
  Group,
  NumberInput,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { CalendarDays } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { JobStatus } from "@/generated/prisma/enums";
import {
  addJobNoteAction,
  assignAction,
  cancelJobAction,
  chargeNowAction,
  refundAction,
  rescheduleAction,
  transitionAction,
  unassignAction,
  waiveAction,
} from "@/modules/admin/actions";
import { JOB_TRANSITIONS } from "@/modules/jobs/transitions";
import { ActionButton } from "./action-button";
import { StatusPill } from "./status-badge";

/** Client panels for the admin job page (app/(admin)/admin/jobs/[id]). */

const label = (s: string) => s.charAt(0) + s.slice(1).replaceAll("_", " ").toLowerCase();
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

// ── Cleaners ────────────────────────────────────────────────────────────────

export function UnassignButton({ jobId, cleanerId }: { jobId: string; cleanerId: string }) {
  return (
    <ActionButton action={() => unassignAction(jobId, cleanerId)} variant="subtle" color="red">
      Remove
    </ActionButton>
  );
}

export type Suggestion = {
  id: string;
  firstName: string;
  eligible: boolean;
  reasons: string[];
  warnings: string[];
};

export function SuggestPanel({ jobId, suggestions }: { jobId: string; suggestions: Suggestion[] }) {
  if (!suggestions.length) return null;
  return (
    <Stack gap={6}>
      <Text size="xs" fw={600} c="dimmed" tt="uppercase">
        Suggested
      </Text>
      {suggestions.slice(0, 5).map((s) => (
        <Paper
          key={s.id}
          px="sm"
          py={8}
          data-testid={`suggest-${s.id}`}
          style={{ opacity: s.eligible ? 1 : 0.65 }}
        >
          <Group justify="space-between" wrap="nowrap" gap="sm">
            <div style={{ minWidth: 0 }}>
              <Text size="sm" fw={500} span>
                {s.firstName}
              </Text>
              {s.reasons.length ? (
                <Text size="xs" c="teal" span ml="xs">
                  {s.reasons.join(" · ")}
                </Text>
              ) : null}
              {s.warnings.length ? (
                <Text size="xs" c="orange" span ml="xs">
                  {s.warnings.join(" · ")}
                </Text>
              ) : null}
            </div>
            <ActionButton
              action={() => assignAction(jobId, s.id, !s.eligible)}
              variant={s.eligible ? "filled" : "default"}
            >
              {s.eligible ? "Assign" : "Force"}
            </ActionButton>
          </Group>
        </Paper>
      ))}
    </Stack>
  );
}

export function AssignPanel({
  jobId,
  cleaners,
  assigned,
}: {
  jobId: string;
  cleaners: { id: string; name: string }[];
  assigned: string[];
}) {
  const [cleanerId, setCleanerId] = useState<string | null>(null);
  const [force, setForce] = useState(false);
  return (
    <Group align="flex-end" gap="sm">
      <Select
        label="Assign someone else"
        placeholder="Choose a cleaner"
        data={cleaners
          .filter((c) => !assigned.includes(c.id))
          .map((c) => ({ value: c.id, label: c.name }))}
        value={cleanerId}
        onChange={setCleanerId}
        searchable
        nothingFoundMessage="No other active cleaners in this region"
        w={{ base: "100%", xs: 240 }}
        data-testid="assign-cleaner"
      />
      <Checkbox
        label="Ignore conflicts"
        checked={force}
        onChange={(e) => setForce(e.currentTarget.checked)}
        mb={8}
      />
      <ActionButton
        action={() => assignAction(jobId, cleanerId ?? "", force)}
        variant="filled"
        size="sm"
        disabled={!cleanerId}
        testId="assign-manual"
      >
        Assign
      </ActionButton>
    </Group>
  );
}

// ── Status, reschedule, cancel ──────────────────────────────────────────────

export function StatusPanel({ jobId, status }: { jobId: string; status: JobStatus }) {
  const next = JOB_TRANSITIONS[status].filter((s) => !["CANCELLED", "SKIPPED"].includes(s));
  if (!next.length)
    return (
      <Text size="sm" c="dimmed">
        No further status changes.
      </Text>
    );
  return (
    <Group gap="xs">
      {next.map((s) => (
        <ActionButton
          key={s}
          action={() => transitionAction(jobId, s)}
          color={s === "NO_SHOW" ? "red" : undefined}
          confirm={
            s === "NO_SHOW" ? "Mark as no-show? The customer may be charged a fee." : undefined
          }
        >
          → {label(s)}
        </ActionButton>
      ))}
    </Group>
  );
}

export function ReschedulePanel({
  jobId,
  date,
  windowId,
  windows,
}: {
  jobId: string;
  date: string;
  windowId: string | null;
  windows: { id: string; label: string }[];
}) {
  const [d, setD] = useState<string | null>(date);
  const [w, setW] = useState<string | null>(windowId ?? windows[0]?.id ?? null);
  const [override, setOverride] = useState(false);
  return (
    <Group align="flex-end" gap="sm">
      <DatePickerInput
        label="New date"
        value={d}
        onChange={setD}
        valueFormat="ddd, MMM D, YYYY"
        leftSection={<CalendarDays size={16} strokeWidth={1.75} />}
        w={{ base: "100%", xs: 210 }}
      />
      <Select
        label="Arrival window"
        data={windows.map((x) => ({ value: x.id, label: x.label }))}
        value={w}
        onChange={setW}
        allowDeselect={false}
        w={{ base: "100%", xs: 170 }}
      />
      <Checkbox
        label="Override capacity"
        checked={override}
        onChange={(e) => setOverride(e.currentTarget.checked)}
        mb={8}
      />
      <ActionButton
        action={() => rescheduleAction(jobId, d ?? "", w ?? "", override)}
        size="sm"
        disabled={!d || !w}
      >
        Reschedule
      </ActionButton>
    </Group>
  );
}

export function CancelPanel({
  jobId,
  late,
  feeCents,
  recurring,
}: {
  jobId: string;
  late: boolean;
  feeCents: number;
  recurring: boolean;
}) {
  const [reason, setReason] = useState("");
  const [waive, setWaive] = useState(!late);
  return (
    <Stack gap="xs">
      <TextInput
        label="Reason"
        placeholder="Shown in the timeline"
        value={reason}
        onChange={(e) => setReason(e.currentTarget.value)}
      />
      {late ? (
        <Checkbox
          label={`Waive the late-cancel fee (${money(feeCents)})`}
          checked={waive}
          onChange={(e) => setWaive(e.currentTarget.checked)}
        />
      ) : (
        <Text size="xs" c="dimmed">
          Outside the late-cancel window: no fee.
        </Text>
      )}
      <Group gap="xs">
        <ActionButton
          action={() => cancelJobAction(jobId, reason, waive)}
          color="red"
          variant="light"
          size="sm"
          confirm="Cancel this visit?"
        >
          Cancel visit
        </ActionButton>
        {recurring ? (
          <ActionButton
            action={() => cancelJobAction(jobId, reason, true, true)}
            size="sm"
            confirm="Skip this occurrence without a fee?"
          >
            Skip (no fee)
          </ActionButton>
        ) : null}
      </Group>
    </Stack>
  );
}

// ── Payment ─────────────────────────────────────────────────────────────────

const REFUND_REASONS = ["GOODWILL", "QUALITY", "CANCELLED", "DUPLICATE", "OTHER"] as const;
type RefundReason = (typeof REFUND_REASONS)[number];

export type ChargeView = {
  id: string;
  type: string;
  status: string;
  amountCents: number;
  refundedCents: number;
};

function RefundForm({ charge, onDone }: { charge: ChargeView; onDone: () => void }) {
  const max = (charge.amountCents - charge.refundedCents) / 100;
  const [amount, setAmount] = useState<number | string>(max);
  const [reason, setReason] = useState<RefundReason>("GOODWILL");
  return (
    <Group align="flex-end" gap="xs" mt="xs">
      <NumberInput
        label="Amount"
        prefix="$"
        decimalScale={2}
        min={0.01}
        max={max}
        value={amount}
        onChange={setAmount}
        w={120}
        size="xs"
      />
      <Select
        label="Reason"
        data={REFUND_REASONS.map((r) => ({ value: r, label: label(r) }))}
        value={reason}
        onChange={(v) => v && setReason(v as RefundReason)}
        allowDeselect={false}
        w={140}
        size="xs"
      />
      <ActionButton
        action={() => refundAction(charge.id, Math.round(Number(amount) * 100), reason, "")}
        color="red"
        variant="light"
        confirm={`Refund ${money(Math.round(Number(amount) * 100))} to the customer's card?`}
        onDone={onDone}
      >
        Refund
      </ActionButton>
      <Button size="xs" variant="subtle" color="gray" onClick={onDone}>
        Cancel
      </Button>
    </Group>
  );
}

export function PaymentPanel({
  jobId,
  status,
  paymentStatus,
  charges,
  stripeConfigured,
}: {
  jobId: string;
  status: JobStatus;
  paymentStatus: string;
  charges: ChargeView[];
  stripeConfigured: boolean;
}) {
  const [refundFor, setRefundFor] = useState<string | null>(null);
  const [waiveNote, setWaiveNote] = useState("");
  const canCharge = ["UNPAID", "FAILED"].includes(paymentStatus);
  return (
    <Stack gap="sm">
      {canCharge ? (
        <Group align="flex-end" gap="xs">
          <ActionButton
            action={() => chargeNowAction(jobId, status !== "COMPLETED")}
            variant="filled"
            size="sm"
            confirm={
              status !== "COMPLETED" ? "This visit isn't completed. Charge anyway?" : undefined
            }
          >
            {stripeConfigured ? "Charge card now" : "Charge (Stripe not configured)"}
          </ActionButton>
          <TextInput
            placeholder="Reason for waiving"
            aria-label="Reason for waiving"
            value={waiveNote}
            onChange={(e) => setWaiveNote(e.currentTarget.value)}
            w={{ base: "100%", xs: 220 }}
          />
          <ActionButton
            action={() => waiveAction(jobId, waiveNote)}
            size="sm"
            confirm="Mark this visit as not to be charged?"
          >
            Waive
          </ActionButton>
        </Group>
      ) : null}
      {charges.length ? (
        <Table.ScrollContainer minWidth={420}>
          <Table verticalSpacing={6}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Charge</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th ta="right">Amount</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {charges.map((c) => (
                <Table.Tr key={c.id}>
                  <Table.Td>{label(c.type)}</Table.Td>
                  <Table.Td>
                    <StatusPill status={c.status} />
                  </Table.Td>
                  <Table.Td ta="right" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {money(c.amountCents)}
                    {c.refundedCents ? (
                      <Text size="xs" c="orange">
                        refunded {money(c.refundedCents)}
                      </Text>
                    ) : null}
                  </Table.Td>
                  <Table.Td ta="right">
                    {["CAPTURED", "PARTIALLY_REFUNDED"].includes(c.status) && refundFor !== c.id ? (
                      <Button size="xs" variant="subtle" onClick={() => setRefundFor(c.id)}>
                        Refund…
                      </Button>
                    ) : null}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      ) : (
        <Text size="sm" c="dimmed">
          No charges yet.
        </Text>
      )}
      {refundFor ? (
        <RefundForm
          charge={charges.find((c) => c.id === refundFor)!}
          onDone={() => setRefundFor(null)}
        />
      ) : null}
    </Stack>
  );
}

// ── Notes ───────────────────────────────────────────────────────────────────

export function NotePanel({ jobId }: { jobId: string }) {
  const [note, setNote] = useState("");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await addJobNoteAction(jobId, note);
          if (res.ok) {
            setNote("");
            toast.success("Note added");
            router.refresh();
          } else toast.error(res.message);
        });
      }}
    >
      <Stack gap="xs">
        <Textarea
          placeholder="Internal note for dispatch and cleaners"
          aria-label="Internal note"
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
          autosize
          minRows={2}
        />
        <Group>
          <Button
            type="submit"
            size="xs"
            variant="default"
            loading={pending}
            disabled={!note.trim()}
          >
            Add note
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
