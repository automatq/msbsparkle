"use client";

import { useState } from "react";
import {
  archivePricingAction,
  cloneDraftPricingAction,
  publishPricingAction,
  updateRateAction,
} from "@/modules/admin/actions";
import { ActionButton } from "./ui";

export function CloneButton({
  tableId,
  regionId,
  label = "Clone to draft",
}: {
  tableId: string;
  regionId?: string | null;
  label?: string;
}) {
  return (
    <ActionButton action={() => cloneDraftPricingAction(tableId, regionId)}>{label}</ActionButton>
  );
}

export function PublishPanel({ tableId, status }: { tableId: string; status: string }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  if (status !== "DRAFT")
    return status === "PUBLISHED" ? (
      <ActionButton
        action={() => archivePricingAction(tableId)}
        confirm="Archive this table? Quotes will fall back to the previous published version."
      >
        Archive
      </ActionButton>
    ) : null;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span>Effective from</span>
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="h-8 rounded-lg border px-2"
      />
      <ActionButton
        action={() => publishPricingAction(tableId, date)}
        variant="default"
        confirm="Publish? Published tables are immutable."
      >
        Publish
      </ActionButton>
    </div>
  );
}

export function RateCell({
  tableId,
  rateId,
  field,
  value,
  editable,
  scale = 100,
  step = "0.01",
}: {
  tableId: string;
  rateId: string;
  field: "amountCents" | "bps" | "minutes";
  value: number | null;
  editable: boolean;
  scale?: number;
  step?: string;
}) {
  const [v, setV] = useState(value === null ? "" : String(value / scale));
  if (!editable) return <span>{value === null ? "—" : value / scale}</span>;
  return (
    <input
      type="number"
      step={step}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={async () => {
        const next = v === "" ? null : Math.round(Number(v) * scale);
        if (next !== value) await updateRateAction(tableId, rateId, { [field]: next });
      }}
      className="h-8 w-24 rounded-lg border px-2 text-right"
    />
  );
}
