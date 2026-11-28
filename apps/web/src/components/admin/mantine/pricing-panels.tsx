"use client";

import { Button, type ButtonProps, Group, Loader, NumberInput } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  archivePricingAction,
  cloneDraftPricingAction,
  publishPricingAction,
  updateRateAction,
} from "@/modules/admin/actions";
import { ActionButton } from "./action-button";

/** Copies a table into a new draft (optionally as a region override) and opens the draft. */
export function CloneButton({
  tableId,
  regionId,
  label = "Clone to draft",
  ...button
}: {
  tableId: string;
  regionId?: string | null;
  label?: string;
} & Omit<ButtonProps, "children" | "loading">) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="default"
      size="xs"
      {...button}
      loading={pending}
      onClick={() =>
        start(async () => {
          const res = await cloneDraftPricingAction(tableId, regionId);
          if (!res.ok) return void toast.error(res.message);
          toast.success("Draft created");
          router.push(`/admin/pricing/${res.id}`);
        })
      }
    >
      {label}
    </Button>
  );
}

export function PublishPanel({ tableId, status }: { tableId: string; status: string }) {
  const [date, setDate] = useState<string | null>(new Date().toISOString().slice(0, 10));
  if (status === "PUBLISHED")
    return (
      <ActionButton
        size="sm"
        action={() => archivePricingAction(tableId)}
        confirm="Archive this table? Quotes will fall back to the previous published version."
      >
        Archive
      </ActionButton>
    );
  if (status !== "DRAFT") return null;
  return (
    <Group gap="xs" align="flex-end">
      <DatePickerInput
        label="Effective from"
        value={date}
        onChange={setDate}
        valueFormat="MMM D, YYYY"
        w={160}
      />
      <ActionButton
        size="sm"
        variant="filled"
        disabled={!date}
        action={() => publishPricingAction(tableId, date!)}
        confirm="Publish? Published tables can't be edited; you'd clone a new draft instead."
      >
        Publish
      </ActionButton>
    </Group>
  );
}

const fmt = (value: number | null, scale: number) => (value === null ? "—" : value / scale);

/** One editable number in a draft rate sheet. Saves when the field loses focus. */
export function RateCell({
  tableId,
  rateId,
  field,
  value,
  editable,
  scale = 100,
  step = 0.01,
  label,
}: {
  tableId: string;
  rateId: string;
  field: "amountCents" | "bps" | "minutes";
  value: number | null;
  editable: boolean;
  scale?: number;
  step?: number;
  label: string;
}) {
  const [saved, setSaved] = useState(value);
  const [v, setV] = useState<string | number>(value === null ? "" : value / scale);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  if (!editable) return <>{fmt(value, scale)}</>;

  const save = async () => {
    const next = v === "" ? null : Math.round(Number(v) * scale);
    if (next === saved || Number.isNaN(next)) return;
    setState("saving");
    const res = await updateRateAction(tableId, rateId, { [field]: next });
    if (!res.ok) {
      setState("idle");
      setV(saved === null ? "" : saved / scale);
      return void toast.error(res.message);
    }
    setSaved(next);
    setState("saved");
  };

  return (
    <NumberInput
      aria-label={label}
      size="xs"
      w={110}
      ml="auto"
      hideControls
      step={step}
      decimalScale={scale === 1 ? 0 : 2}
      value={v}
      onChange={(n) => {
        setV(n);
        setState("idle");
      }}
      onBlur={save}
      styles={{ input: { textAlign: "right" } }}
      rightSection={
        state === "saving" ? (
          <Loader size={12} />
        ) : state === "saved" ? (
          <span title="Saved" data-testid="rate-saved" style={{ display: "inline-flex" }}>
            <Check size={14} color="var(--mantine-color-teal-6)" />
          </span>
        ) : null
      }
    />
  );
}
