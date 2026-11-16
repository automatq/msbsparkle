"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addBlackoutAction,
  removeBlackoutAction,
  setCapacityAction,
  updateRegionAction,
  type RegionInput,
} from "@/modules/admin/actions";
import { ActionButton } from "./ui";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function RegionPolicyForm({
  regionId,
  initial,
  canEdit,
}: {
  regionId: string;
  initial: RegionInput;
  canEdit: boolean;
}) {
  const [v, setV] = useState(initial);
  const set = <K extends keyof RegionInput>(k: K, val: RegionInput[K]) =>
    setV((s) => ({ ...s, [k]: val }));
  const dis = !canEdit;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <F label="Name">
        <Input value={v.name} onChange={(e) => set("name", e.target.value)} disabled={dis} />
      </F>
      <F label="Status">
        <select
          value={v.status}
          onChange={(e) => set("status", e.target.value as RegionInput["status"])}
          disabled={dis}
          className="h-9 w-full rounded-lg border bg-background px-2 text-sm"
        >
          {["ACTIVE", "COMING_SOON", "PAUSED"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </F>
      <F label="Local phone">
        <Input
          value={v.phone ?? ""}
          onChange={(e) => set("phone", e.target.value)}
          disabled={dis}
        />
      </F>
      <F label="Local email">
        <Input
          value={v.email ?? ""}
          onChange={(e) => set("email", e.target.value)}
          disabled={dis}
        />
      </F>
      <F label="Minimum lead time (hours)">
        <Input
          type="number"
          value={v.minLeadHours}
          onChange={(e) => set("minLeadHours", Number(e.target.value))}
          disabled={dis}
        />
      </F>
      <F label="Max days in advance">
        <Input
          type="number"
          value={v.maxAdvanceDays}
          onChange={(e) => set("maxAdvanceDays", Number(e.target.value))}
          disabled={dis}
        />
      </F>
      <F label="Late-cancel window (hours)">
        <Input
          type="number"
          value={v.lateCancelWindowHours}
          onChange={(e) => set("lateCancelWindowHours", Number(e.target.value))}
          disabled={dis}
        />
      </F>
      <F label="Late-cancel fee">
        <div className="flex gap-2">
          <select
            value={v.lateCancelFeeType}
            onChange={(e) =>
              set("lateCancelFeeType", e.target.value as RegionInput["lateCancelFeeType"])
            }
            disabled={dis}
            className="h-9 rounded-lg border bg-background px-2 text-sm"
          >
            <option value="FIXED">$ fixed</option>
            <option value="PERCENT">% of job</option>
          </select>
          <Input
            type="number"
            step={v.lateCancelFeeType === "FIXED" ? "0.01" : "1"}
            value={
              v.lateCancelFeeType === "FIXED"
                ? v.lateCancelFeeValue / 100
                : v.lateCancelFeeValue / 100
            }
            onChange={(e) => set("lateCancelFeeValue", Math.round(Number(e.target.value) * 100))}
            disabled={dis}
          />
        </div>
      </F>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input
          type="checkbox"
          checked={v.requireCleanerAcceptance}
          onChange={(e) => set("requireCleanerAcceptance", e.target.checked)}
          disabled={dis}
        />
        Cleaners must accept offered jobs (otherwise assignments are immediate)
      </label>
      {canEdit ? (
        <div className="sm:col-span-2">
          <ActionButton action={() => updateRegionAction(regionId, v)} variant="default">
            Save region
          </ActionButton>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground sm:col-span-2">
          Only super admins can edit region settings.
        </p>
      )}
    </div>
  );
}

export function CapacityGrid({
  regionId,
  windows,
  capacities,
}: {
  regionId: string;
  windows: { id: string; label: string }[];
  capacities: Record<string, number>;
}) {
  const [v, setV] = useState(capacities);
  return (
    <div className="overflow-x-auto">
      <table className="text-sm">
        <thead>
          <tr>
            <th className="p-1 text-left text-xs text-muted-foreground">Window</th>
            {DAYS.map((d) => (
              <th key={d} className="p-1 text-xs font-medium">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {windows.map((w) => (
            <tr key={w.id}>
              <td className="p-1 whitespace-nowrap">{w.label}</td>
              {DAYS.map((_, day) => {
                const key = `${w.id}|${day}`;
                return (
                  <td key={day} className="p-1">
                    <input
                      type="number"
                      min={0}
                      max={50}
                      value={v[key] ?? 0}
                      onChange={(e) => setV((s) => ({ ...s, [key]: Number(e.target.value) }))}
                      onBlur={async () => {
                        if ((v[key] ?? 0) !== (capacities[key] ?? 0))
                          await setCapacityAction(regionId, w.id, day, v[key] ?? 0);
                      }}
                      className="h-8 w-14 rounded-lg border px-1 text-center"
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-xs text-muted-foreground">
        Jobs per window per weekday. Saves when you leave a cell.
      </p>
    </div>
  );
}

export function BlackoutPanel({
  regionId,
  windows,
  blackouts,
}: {
  regionId: string;
  windows: { id: string; label: string }[];
  blackouts: { id: string; date: string; windowLabel: string | null; reason: string | null }[];
}) {
  const [date, setDate] = useState("");
  const [windowId, setWindowId] = useState("");
  const [reason, setReason] = useState("");
  return (
    <div className="space-y-3 text-sm">
      <ul className="space-y-1">
        {blackouts.map((b) => (
          <li key={b.id} className="flex items-center justify-between rounded-lg border px-2 py-1">
            <span>
              {b.date} · {b.windowLabel ?? "all day"}
              {b.reason ? ` · ${b.reason}` : ""}
            </span>
            <ActionButton action={() => removeBlackoutAction(b.id)} size="xs" variant="ghost">
              Remove
            </ActionButton>
          </li>
        ))}
        {blackouts.length === 0 ? (
          <li className="text-muted-foreground">No upcoming blackout dates.</li>
        ) : null}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-8 rounded-lg border px-2"
        />
        <select
          value={windowId}
          onChange={(e) => setWindowId(e.target.value)}
          className="h-8 rounded-lg border bg-background px-2"
        >
          <option value="">All day</option>
          {windows.map((w) => (
            <option key={w.id} value={w.id}>
              {w.label}
            </option>
          ))}
        </select>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason"
          className="h-8 rounded-lg border px-2"
        />
        <ActionButton action={() => addBlackoutAction(regionId, date, windowId || null, reason)}>
          Add blackout
        </ActionButton>
      </div>
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
