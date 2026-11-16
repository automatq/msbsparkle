"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  addJobNoteAction,
  assignAction,
  cancelJobAction,
  chargeNowAction,
  refundAction,
  rescheduleAction,
  transitionAction,
  waiveAction,
  unassignAction,
} from "@/modules/admin/actions";
import type { JobStatus } from "@/generated/prisma/enums";
import { JOB_TRANSITIONS } from "@/modules/jobs/state-machine";
import { ActionButton } from "./ui";

type Cleaner = { id: string; name: string };
type Window = { id: string; label: string };

export function AssignPanel({
  jobId,
  cleaners,
  assigned,
}: {
  jobId: string;
  cleaners: Cleaner[];
  assigned: string[];
}) {
  const [cleanerId, setCleanerId] = useState("");
  const [force, setForce] = useState(false);
  const options = cleaners.filter((c) => !assigned.includes(c.id));
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <select
        value={cleanerId}
        onChange={(e) => setCleanerId(e.target.value)}
        className="h-8 rounded-lg border bg-background px-2"
      >
        <option value="">Choose cleaner…</option>
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1 text-xs">
        <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />{" "}
        Ignore conflicts
      </label>
      <ActionButton
        action={() => assignAction(jobId, cleanerId, force)}
        variant="default"
        testId="assign-manual"
      >
        Assign
      </ActionButton>
    </div>
  );
}

export function StatusPanel({ jobId, status }: { jobId: string; status: JobStatus }) {
  const next = JOB_TRANSITIONS[status].filter((s) => !["CANCELLED", "SKIPPED"].includes(s));
  if (!next.length) return <p className="text-xs text-muted-foreground">No further transitions.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {next.map((s) => (
        <ActionButton
          key={s}
          action={() => transitionAction(jobId, s)}
          confirm={
            s === "NO_SHOW" ? "Mark as no-show? The customer may be charged a fee." : undefined
          }
        >
          → {s.replaceAll("_", " ")}
        </ActionButton>
      ))}
    </div>
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
  windows: Window[];
}) {
  const [d, setD] = useState(date);
  const [w, setW] = useState(windowId ?? windows[0]?.id ?? "");
  const [override, setOverride] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <input
        type="date"
        value={d}
        onChange={(e) => setD(e.target.value)}
        className="h-8 rounded-lg border px-2"
      />
      <select
        value={w}
        onChange={(e) => setW(e.target.value)}
        className="h-8 rounded-lg border bg-background px-2"
      >
        {windows.map((x) => (
          <option key={x.id} value={x.id}>
            {x.label}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1 text-xs">
        <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />{" "}
        Override capacity
      </label>
      <ActionButton action={() => rescheduleAction(jobId, d, w, override)}>Reschedule</ActionButton>
    </div>
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
    <div className="space-y-2 text-sm">
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason"
        className="h-8 w-full rounded-lg border px-2"
      />
      {late ? (
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" checked={waive} onChange={(e) => setWaive(e.target.checked)} />{" "}
          Waive late fee (${(feeCents / 100).toFixed(2)})
        </label>
      ) : (
        <p className="text-xs text-muted-foreground">Outside the late-cancel window, no fee.</p>
      )}
      <div className="flex gap-2">
        <ActionButton
          action={() => cancelJobAction(jobId, reason, waive)}
          variant="destructive"
          confirm="Cancel this visit?"
        >
          Cancel visit
        </ActionButton>
        {recurring ? (
          <ActionButton
            action={() => cancelJobAction(jobId, reason, true, true)}
            confirm="Skip this occurrence without a fee?"
          >
            Skip (no fee)
          </ActionButton>
        ) : null}
      </div>
    </div>
  );
}

export function NotePanel({ jobId }: { jobId: string }) {
  const [note, setNote] = useState("");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-2"
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
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Internal note for dispatch and cleaners"
        rows={2}
      />
      <Button type="submit" size="sm" variant="outline" disabled={pending || !note.trim()}>
        Add note
      </Button>
    </form>
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
  charges: {
    id: string;
    type: string;
    status: string;
    amountCents: number;
    refundedCents: number;
  }[];
  stripeConfigured: boolean;
}) {
  const [refundFor, setRefundFor] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState<
    "QUALITY" | "CANCELLED" | "DUPLICATE" | "GOODWILL" | "OTHER"
  >("GOODWILL");
  const [waiveNote, setWaiveNote] = useState("");
  const canCharge = ["UNPAID", "FAILED"].includes(paymentStatus);
  return (
    <div className="space-y-3 text-sm">
      {canCharge ? (
        <div className="flex flex-wrap items-center gap-2">
          <ActionButton
            action={() => chargeNowAction(jobId, status !== "COMPLETED")}
            variant="default"
            confirm={status !== "COMPLETED" ? "Job is not completed. Charge anyway?" : undefined}
          >
            {stripeConfigured ? "Charge card now" : "Charge (Stripe not configured)"}
          </ActionButton>
          <input
            value={waiveNote}
            onChange={(e) => setWaiveNote(e.target.value)}
            placeholder="Waive reason"
            className="h-8 rounded-lg border px-2"
          />
          <ActionButton
            action={() => waiveAction(jobId, waiveNote)}
            confirm="Mark this job as not to be charged?"
          >
            Waive
          </ActionButton>
        </div>
      ) : null}
      {charges.map((c) => (
        <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
          <span className="font-medium">{c.type.replaceAll("_", " ")}</span>
          <span>${(c.amountCents / 100).toFixed(2)}</span>
          <span className="text-xs text-muted-foreground">{c.status}</span>
          {c.refundedCents ? (
            <span className="text-xs text-orange-700">
              refunded ${(c.refundedCents / 100).toFixed(2)}
            </span>
          ) : null}
          {["CAPTURED", "PARTIALLY_REFUNDED"].includes(c.status) ? (
            refundFor === c.id ? (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Amount $"
                  className="h-8 w-24 rounded-lg border px-2"
                />
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value as typeof reason)}
                  className="h-8 rounded-lg border bg-background px-2"
                >
                  {["QUALITY", "CANCELLED", "DUPLICATE", "GOODWILL", "OTHER"].map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
                <ActionButton
                  action={() => refundAction(c.id, Math.round(Number(amount) * 100), reason, "")}
                  variant="destructive"
                  onDone={() => setRefundFor(null)}
                >
                  Refund
                </ActionButton>
              </div>
            ) : (
              <Button size="xs" variant="ghost" onClick={() => setRefundFor(c.id)}>
                Refund…
              </Button>
            )
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function UnassignButton({ jobId, cleanerId }: { jobId: string; cleanerId: string }) {
  return (
    <ActionButton action={() => unassignAction(jobId, cleanerId)} size="xs">
      Remove
    </ActionButton>
  );
}

export function SuggestPanel({
  jobId,
  suggestions,
}: {
  jobId: string;
  suggestions: {
    id: string;
    firstName: string;
    score: number;
    eligible: boolean;
    reasons: string[];
    warnings: string[];
  }[];
}) {
  if (!suggestions.length) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">Suggested</p>
      <ul className="space-y-1">
        {suggestions.slice(0, 5).map((s) => (
          <li
            key={s.id}
            className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2 text-xs ${s.eligible ? "" : "opacity-60"}`}
            data-testid={`suggest-${s.id}`}
          >
            <span>
              <span className="font-medium">{s.firstName}</span>
              {s.reasons.length ? (
                <span className="ml-2 text-emerald-700">{s.reasons.join(" · ")}</span>
              ) : null}
              {s.warnings.length ? (
                <span className="ml-2 text-amber-700">{s.warnings.join(" · ")}</span>
              ) : null}
            </span>
            <ActionButton
              action={() => assignAction(jobId, s.id, !s.eligible)}
              size="xs"
              variant={s.eligible ? "default" : "outline"}
            >
              {s.eligible ? "Assign" : "Force"}
            </ActionButton>
          </li>
        ))}
      </ul>
    </div>
  );
}
