"use client";

import { useState } from "react";
import {
  adjustEarningAction,
  approveEarningsAction,
  cancelPayoutAction,
  createPayoutsAction,
  markPayoutPaidAction,
  setTimeOffStatusAction,
  voidEarningAction,
  adjustJobPriceAction,
} from "@/modules/admin/ops-actions";
import { ActionButton } from "./ui";

export function ApproveButton({ ids, label }: { ids: string[]; label: string }) {
  return (
    <ActionButton
      action={() => approveEarningsAction(ids)}
      size="xs"
      variant="default"
      testId={ids.length > 1 ? "approve-all" : undefined}
    >
      {label}
    </ActionButton>
  );
}

export function EarningRowActions({
  id,
  adjustmentCents,
}: {
  id: string;
  adjustmentCents: number;
}) {
  const [v, setV] = useState(String(adjustmentCents / 100));
  return (
    <div className="flex flex-wrap items-center gap-1">
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        className="h-7 w-16 rounded border px-1 text-right text-xs"
        aria-label="Adjustment in dollars"
      />
      <ActionButton action={() => adjustEarningAction(id, Math.round(Number(v) * 100))} size="xs">
        Adjust
      </ActionButton>
      <ActionButton action={() => approveEarningsAction([id])} size="xs" variant="default">
        Approve
      </ActionButton>
      <ActionButton
        action={() => voidEarningAction(id)}
        size="xs"
        variant="ghost"
        confirm="Void this earning? The cleaner will not be paid for it."
      >
        Void
      </ActionButton>
    </div>
  );
}

export function CreatePayoutsForm({ start, end }: { start: string; end: string }) {
  const [s, setS] = useState(start);
  const [e, setE] = useState(end);
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span>Jobs completed</span>
      <input
        type="date"
        value={s}
        onChange={(ev) => setS(ev.target.value)}
        className="h-8 rounded-lg border px-2"
      />
      <span>to</span>
      <input
        type="date"
        value={e}
        onChange={(ev) => setE(ev.target.value)}
        className="h-8 rounded-lg border px-2"
      />
      <ActionButton
        action={() => createPayoutsAction(s, e)}
        variant="default"
        size="sm"
        testId="create-payouts"
      >
        Create payouts
      </ActionButton>
    </div>
  );
}

export function PayoutRowActions({ id, status }: { id: string; status: string }) {
  if (status === "PAID") return null;
  return (
    <div className="flex gap-1">
      <ActionButton
        action={() => markPayoutPaidAction(id)}
        size="xs"
        variant="default"
        confirm="Mark this payout as paid? Do this after you've sent the money."
      >
        Mark paid
      </ActionButton>
      <ActionButton action={() => cancelPayoutAction(id)} size="xs" variant="ghost">
        Cancel
      </ActionButton>
    </div>
  );
}

export function TimeOffActions({ id }: { id: string }) {
  return (
    <div className="flex gap-1">
      <ActionButton
        action={() => setTimeOffStatusAction(id, "APPROVED")}
        size="xs"
        variant="default"
      >
        Approve
      </ActionButton>
      <ActionButton action={() => setTimeOffStatusAction(id, "DENIED")} size="xs" variant="ghost">
        Decline
      </ActionButton>
    </div>
  );
}

export function PriceAdjustPanel({ jobId }: { jobId: string }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="± $ pre-tax"
        className="h-8 w-24 rounded-lg border px-2"
        data-testid="adjust-amount"
      />
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Reason"
        className="h-8 w-40 rounded-lg border px-2"
      />
      <ActionButton
        action={() => adjustJobPriceAction(jobId, Math.round(Number(amount) * 100), note)}
        size="xs"
        testId="adjust-apply"
      >
        Adjust price
      </ActionButton>
    </div>
  );
}
