"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  cancelSeriesAction,
  cancelVisitAction,
  pauseSeriesAction,
  rateVisitAction,
  rescheduleVisitAction,
  resumeSeriesAction,
  setDefaultCardAction,
  updateAddressNotesAction,
  updateProfileAction,
  visitAvailabilityAction,
  type CustomerActionResult,
} from "@/modules/customer/actions";
import type { DayAvailability } from "@/modules/scheduling/availability";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<CustomerActionResult>, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(res.message ?? "Done");
        router.refresh();
        after?.();
      } else toast.error(res.message);
    });
  return { run, pending };
}

function formatDay(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function ReschedulePanel({
  jobId,
  late,
  feeCents,
}: {
  jobId: string;
  late: boolean;
  feeCents: number;
}) {
  const { run, pending } = useRun();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<DayAvailability[] | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [windowId, setWindowId] = useState<string | null>(null);
  useEffect(() => {
    if (open && !days) visitAvailabilityAction(jobId).then((r) => setDays(r.days));
  }, [open, days, jobId]);
  if (!open)
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        data-testid="reschedule-open"
      >
        Reschedule
      </Button>
    );
  const day = days?.find((d) => d.date === date);
  return (
    <div className="space-y-3 rounded-lg border p-3 text-sm">
      {late ? (
        <p className="text-amber-800">
          This visit is inside the 24-hour window. Changing it now adds a $
          {(feeCents / 100).toFixed(2)} fee.
        </p>
      ) : (
        <p className="text-muted-foreground">
          Free to change up to 24 hours before your arrival window.
        </p>
      )}
      {!days ? (
        <p className="text-muted-foreground">Loading availability…</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {days
            .filter((d) => d.windows.some((w) => w.open))
            .map((d) => (
              <button
                key={d.date}
                type="button"
                onClick={() => {
                  setDate(d.date);
                  setWindowId(null);
                }}
                className={`rounded-lg border px-2 py-1 text-xs ${date === d.date ? "border-primary ring-2 ring-primary/30" : ""}`}
                data-testid={`rs-date-${d.date}`}
              >
                {formatDay(d.date)}
              </button>
            ))}
        </div>
      )}
      {day ? (
        <div className="flex flex-wrap gap-1.5">
          {day.windows.map((w) => (
            <button
              key={w.windowId}
              type="button"
              disabled={!w.open}
              onClick={() => setWindowId(w.windowId)}
              className={`rounded-lg border px-2 py-1 text-xs disabled:opacity-40 ${windowId === w.windowId ? "border-primary ring-2 ring-primary/30" : ""}`}
              data-testid={`rs-window-${w.startLocal}`}
            >
              {w.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pending || !date || !windowId}
          onClick={() =>
            run(
              () => rescheduleVisitAction(jobId, date!, windowId!),
              () => setOpen(false),
            )
          }
          data-testid="reschedule-confirm"
        >
          Confirm change
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Never mind
        </Button>
      </div>
    </div>
  );
}

export function CancelVisitButton({
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
  const { run, pending } = useRun();
  const msg = late
    ? `Cancel this visit? A late-cancellation fee of $${(feeCents / 100).toFixed(2)} applies.`
    : recurring
      ? "Skip this visit? No fee; your series continues."
      : "Cancel this visit? No fee.";
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      className="text-destructive"
      onClick={() => {
        if (window.confirm(msg)) run(() => cancelVisitAction(jobId, ""));
      }}
      data-testid="cancel-visit"
    >
      {recurring && !late ? "Skip" : "Cancel"}
    </Button>
  );
}

export function SeriesControls({ bookingId, status }: { bookingId: string; status: string }) {
  const { run, pending } = useRun();
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  return (
    <div className="space-y-3 text-sm">
      {status === "PAUSED" ? (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(() => resumeSeriesAction(bookingId))}
        >
          Resume series
        </Button>
      ) : (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Going away? Pause your visits</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-8 rounded-lg border px-2"
            />
            <span>to</span>
            <input
              type="date"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              className="h-8 rounded-lg border px-2"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={pending || !from || !until}
              onClick={() => run(() => pauseSeriesAction(bookingId, from, until))}
            >
              Pause
            </Button>
          </div>
        </div>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="text-destructive"
        disabled={pending}
        onClick={() => {
          if (window.confirm("Cancel all future visits? Visits within 24 hours may carry a fee."))
            run(() => cancelSeriesAction(bookingId, ""));
        }}
      >
        Cancel all future visits
      </Button>
    </div>
  );
}

export function RatePanel({ jobId, cleanerName }: { jobId: string; cleanerName: string | null }) {
  const { run, pending } = useRun();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [tip, setTip] = useState<number>(0);
  return (
    <div className="space-y-3 rounded-lg border p-3 text-sm">
      <p className="font-medium">How was your clean{cleanerName ? ` with ${cleanerName}` : ""}?</p>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            className={`text-2xl ${n <= rating ? "text-amber-500" : "text-muted-foreground/40"}`}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            data-testid={`star-${n}`}
          >
            ★
          </button>
        ))}
      </div>
      <Textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
        placeholder="Anything we should know? (optional)"
      />
      <div>
        <p className="mb-1 text-xs text-muted-foreground">Add a tip (100% goes to your cleaner)</p>
        <div className="flex flex-wrap gap-1.5">
          {[0, 500, 1000, 1500, 2000].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setTip(c)}
              className={`rounded-full border px-3 py-1 text-xs ${tip === c ? "border-primary bg-primary text-primary-foreground" : ""}`}
              data-testid={`tip-${c}`}
            >
              {c === 0 ? "No tip" : `$${c / 100}`}
            </button>
          ))}
        </div>
      </div>
      <Button
        size="sm"
        disabled={pending || rating === 0}
        onClick={() => run(() => rateVisitAction(jobId, { rating, comment, tipCents: tip }))}
        data-testid="submit-rating"
      >
        Submit
      </Button>
    </div>
  );
}

export function ProfileForm({
  initial,
}: {
  initial: {
    firstName: string;
    lastName: string;
    phone: string;
    marketingOptIn: boolean;
    smsOptOut: boolean;
  };
}) {
  const { run, pending } = useRun();
  const [v, setV] = useState(initial);
  return (
    <div className="grid gap-3 text-sm sm:grid-cols-2">
      <label className="space-y-1">
        <span className="text-xs text-muted-foreground">First name</span>
        <input
          value={v.firstName}
          onChange={(e) => setV({ ...v, firstName: e.target.value })}
          className="h-9 w-full rounded-lg border px-2"
        />
      </label>
      <label className="space-y-1">
        <span className="text-xs text-muted-foreground">Last name</span>
        <input
          value={v.lastName}
          onChange={(e) => setV({ ...v, lastName: e.target.value })}
          className="h-9 w-full rounded-lg border px-2"
        />
      </label>
      <label className="space-y-1 sm:col-span-2">
        <span className="text-xs text-muted-foreground">Mobile</span>
        <input
          value={v.phone}
          onChange={(e) => setV({ ...v, phone: e.target.value })}
          className="h-9 w-full rounded-lg border px-2"
        />
      </label>
      <label className="flex items-center gap-2 sm:col-span-2">
        <input
          type="checkbox"
          checked={v.marketingOptIn}
          onChange={(e) => setV({ ...v, marketingOptIn: e.target.checked })}
        />
        Email me offers and news
      </label>
      <label className="flex items-center gap-2 sm:col-span-2">
        <input
          type="checkbox"
          checked={v.smsOptOut}
          onChange={(e) => setV({ ...v, smsOptOut: e.target.checked })}
        />
        Don&apos;t text me reminders (email only)
      </label>
      <div className="sm:col-span-2">
        <Button size="sm" disabled={pending} onClick={() => run(() => updateProfileAction(v))}>
          Save
        </Button>
      </div>
    </div>
  );
}

export function AddressNotesForm({
  addressId,
  initial,
}: {
  addressId: string;
  initial: { entryInstructions: string; parkingInstructions: string; pets: string };
}) {
  const { run, pending } = useRun();
  const [v, setV] = useState(initial);
  return (
    <div className="grid gap-3 text-sm">
      <label className="space-y-1">
        <span className="text-xs text-muted-foreground">How we get in</span>
        <Textarea
          value={v.entryInstructions}
          onChange={(e) => setV({ ...v, entryInstructions: e.target.value })}
          rows={2}
        />
      </label>
      <label className="space-y-1">
        <span className="text-xs text-muted-foreground">Parking</span>
        <Textarea
          value={v.parkingInstructions}
          onChange={(e) => setV({ ...v, parkingInstructions: e.target.value })}
          rows={2}
        />
      </label>
      <label className="space-y-1">
        <span className="text-xs text-muted-foreground">Pets</span>
        <input
          value={v.pets}
          onChange={(e) => setV({ ...v, pets: e.target.value })}
          className="h-9 w-full rounded-lg border px-2"
        />
      </label>
      <div>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(() => updateAddressNotesAction(addressId, v))}
        >
          Save notes
        </Button>
      </div>
    </div>
  );
}

export function DefaultCardButton({ paymentMethodId }: { paymentMethodId: string }) {
  const { run, pending } = useRun();
  return (
    <Button
      size="xs"
      variant="ghost"
      disabled={pending}
      onClick={() => run(() => setDefaultCardAction(paymentMethodId))}
    >
      Make default
    </Button>
  );
}
