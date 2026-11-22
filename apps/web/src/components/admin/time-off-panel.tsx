"use client";

import Link from "next/link";
import { useState } from "react";
import { ActionButton, StatusBadge } from "@/components/admin/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addTimeOffAction,
  decideTimeOffAction,
  removeTimeOffAction,
} from "@/modules/admin/time-off-actions";

export type TimeOffRow = {
  id: string;
  from: string; // YYYY-MM-DD
  to: string;
  reason: string | null;
  status: "REQUESTED" | "APPROVED" | "DENIED";
  cleaner?: { id: string; name: string };
};

const days = (r: TimeOffRow) => (r.from === r.to ? r.from : `${r.from} → ${r.to}`);

function Decide({ row, cleanerId }: { row: TimeOffRow; cleanerId: string }) {
  return (
    <>
      {row.status !== "APPROVED" ? (
        <ActionButton
          variant="default"
          action={() => decideTimeOffAction(row.id, "APPROVED", cleanerId)}
          testId={`time-off-approve-${row.id}`}
        >
          Approve
        </ActionButton>
      ) : null}
      {row.status !== "DENIED" ? (
        <ActionButton
          action={() => decideTimeOffAction(row.id, "DENIED", cleanerId)}
          testId={`time-off-deny-${row.id}`}
        >
          {row.status === "APPROVED" ? "Revoke" : "Deny"}
        </ActionButton>
      ) : null}
    </>
  );
}

/** Requests waiting for a decision, across the cleaners this admin manages. */
export function PendingTimeOff({ rows }: { rows: TimeOffRow[] }) {
  if (!rows.length) return null;
  return (
    <section
      className="rounded-lg border border-amber-300 bg-amber-50 p-4"
      data-testid="pending-time-off"
    >
      <h2 className="text-sm font-semibold text-amber-950">
        {rows.length} time-off request{rows.length > 1 ? "s" : ""} waiting for a decision
      </h2>
      <p className="mb-3 text-xs text-amber-900">
        Until a request is approved, the cleaner can still be scheduled on those days.
      </p>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              <Link href={`/admin/cleaners/${r.cleaner!.id}`} className="font-medium underline">
                {r.cleaner!.name}
              </Link>{" "}
              · {days(r)}
              {r.reason ? <span className="text-muted-foreground"> · {r.reason}</span> : null}
            </span>
            <span className="flex gap-2">
              <Decide row={r} cleanerId={r.cleaner!.id} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** One cleaner's time off: decide requests, add time off for them, or remove an entry. */
export function TimeOffPanel({ cleanerId, rows }: { cleanerId: string; rows: TimeOffRow[] }) {
  const [form, setForm] = useState({ from: "", to: "", reason: "" });
  return (
    <div className="space-y-4">
      {rows.length ? (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm"
              data-testid={`time-off-${r.id}`}
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{days(r)}</span>
                <StatusBadge status={r.status} />
                {r.reason ? <span className="text-muted-foreground">{r.reason}</span> : null}
              </span>
              <span className="flex gap-2">
                <Decide row={r} cleanerId={cleanerId} />
                <ActionButton
                  variant="ghost"
                  confirm={`Remove the time off for ${days(r)}?`}
                  action={() => removeTimeOffAction(r.id, cleanerId)}
                  testId={`time-off-remove-${r.id}`}
                >
                  Remove
                </ActionButton>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No current or upcoming time off.</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="time-off-from">First day</Label>
          <Input
            id="time-off-from"
            type="date"
            value={form.from}
            onChange={(e) =>
              setForm((f) => ({ ...f, from: e.target.value, to: f.to || e.target.value }))
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="time-off-to">Last day</Label>
          <Input
            id="time-off-to"
            type="date"
            min={form.from || undefined}
            value={form.to}
            onChange={(e) => setForm((f) => ({ ...f, to: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="time-off-reason">Reason (optional)</Label>
          <Input
            id="time-off-reason"
            value={form.reason}
            maxLength={300}
            onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
          />
        </div>
        <ActionButton
          variant="default"
          size="default"
          action={() => addTimeOffAction(cleanerId, form)}
          onDone={() => setForm({ from: "", to: "", reason: "" })}
          testId="time-off-add"
        >
          Add time off
        </ActionButton>
      </div>
      <p className="text-xs text-muted-foreground">
        Time off you add is approved straight away. Only approved time off keeps a cleaner off the
        schedule.
      </p>
    </div>
  );
}
