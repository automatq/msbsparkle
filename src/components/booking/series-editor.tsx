"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  applySeriesEditAdminAction,
  previewSeriesEditAdminAction,
} from "@/modules/admin/ops-actions";
import type { SeriesChanges, SeriesEditPreview } from "@/modules/bookings/edit-booking";
import { applyPlanEditAction, previewPlanEditAction } from "@/modules/customer/actions";
import { formatCents } from "@/modules/shared/money";

type Current = {
  frequency: "WEEKLY" | "BIWEEKLY" | "EVERY_4_WEEKS";
  windowId: string;
  bedrooms: number;
  bathrooms: number;
  extras: { slug: string; qty: number }[];
  nextDate: string | null;
};

const FREQ = [
  { v: "WEEKLY", l: "Weekly (save 20%)" },
  { v: "BIWEEKLY", l: "Every 2 weeks (save 15%)" },
  { v: "EVERY_4_WEEKS", l: "Every 4 weeks (save 10%)" },
] as const;

/** "Change this plan for all future visits". Shared by the admin booking page and the customer plan page. */
export function SeriesEditor({
  bookingId,
  mode,
  current,
  windows,
  extras,
}: {
  bookingId: string;
  mode: "admin" | "customer";
  current: Current;
  windows: { id: string; label: string }[];
  extras: { slug: string; name: string; maxQty: number }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ ...current, startDate: "" });
  const [preview, setPreview] = useState<SeriesEditPreview | null>(null);
  const [pending, start] = useTransition();

  const changes = (): SeriesChanges => ({
    ...(v.frequency !== current.frequency ? { frequency: v.frequency } : {}),
    ...(v.windowId !== current.windowId ? { windowId: v.windowId } : {}),
    ...(v.startDate ? { startDate: v.startDate } : {}),
    ...(v.bedrooms !== current.bedrooms ? { bedrooms: v.bedrooms } : {}),
    ...(v.bathrooms !== current.bathrooms ? { bathrooms: v.bathrooms } : {}),
    ...(JSON.stringify(v.extras) !== JSON.stringify(current.extras) ? { extras: v.extras } : {}),
  });
  const dirty = Object.keys(changes()).length > 0;
  const qty = (slug: string) => v.extras.find((e) => e.slug === slug)?.qty ?? 0;
  const setQty = (slug: string, q: number) => {
    setPreview(null);
    setV((s) => ({
      ...s,
      extras: [
        ...s.extras.filter((e) => e.slug !== slug),
        ...(q > 0 ? [{ slug, qty: q }] : []),
      ].sort((a, b) => a.slug.localeCompare(b.slug)),
    }));
  };
  const upd = (patch: Partial<typeof v>) => {
    setPreview(null);
    setV((s) => ({ ...s, ...patch }));
  };

  if (!open)
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        data-testid="series-edit-open"
      >
        Change plan
      </Button>
    );
  return (
    <div className="space-y-3 rounded-lg border p-3 text-sm" data-testid="series-editor">
      <p className="text-xs text-muted-foreground">
        Applies to all upcoming visits that aren&apos;t within 24 hours, already started, or
        individually changed.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">How often</span>
          <select
            value={v.frequency}
            onChange={(e) => upd({ frequency: e.target.value as Current["frequency"] })}
            className="h-9 w-full rounded-lg border bg-background px-2"
            data-testid="series-frequency"
          >
            {FREQ.map((f) => (
              <option key={f.v} value={f.v}>
                {f.l}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Arrival window</span>
          <select
            value={v.windowId}
            onChange={(e) => upd({ windowId: e.target.value })}
            className="h-9 w-full rounded-lg border bg-background px-2"
            data-testid="series-window"
          >
            {windows.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">
            Restart the schedule from (optional, changes the weekday)
          </span>
          <input
            type="date"
            value={v.startDate}
            onChange={(e) => upd({ startDate: e.target.value })}
            className="h-9 w-full rounded-lg border px-2"
          />
        </label>
        <div className="flex gap-3">
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Bedrooms</span>
            <input
              type="number"
              min={0}
              max={12}
              value={v.bedrooms}
              onChange={(e) => upd({ bedrooms: Number(e.target.value) })}
              className="h-9 w-20 rounded-lg border px-2"
              data-testid="series-bedrooms"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Bathrooms</span>
            <input
              type="number"
              min={1}
              max={12}
              step={0.5}
              value={v.bathrooms}
              onChange={(e) => upd({ bathrooms: Number(e.target.value) })}
              className="h-9 w-20 rounded-lg border px-2"
            />
          </label>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        {extras.map((x) => (
          <label
            key={x.slug}
            className={`flex items-center gap-1 rounded-full border px-2 py-1 ${qty(x.slug) ? "border-primary" : ""}`}
          >
            <input
              type="checkbox"
              checked={qty(x.slug) > 0}
              onChange={(e) => setQty(x.slug, e.target.checked ? 1 : 0)}
            />
            {x.name}
          </label>
        ))}
      </div>
      {preview ? (
        <div className="rounded-lg bg-muted/40 p-3 text-xs" data-testid="series-preview">
          <p>
            Per visit: <span className="line-through">{formatCents(preview.currentCents)}</span> →{" "}
            <span className="font-semibold">{formatCents(preview.newCents)}</span> incl. tax
          </p>
          <p>
            {preview.affectedVisits} upcoming visit{preview.affectedVisits === 1 ? "" : "s"} will
            change{preview.keptVisits ? `; ${preview.keptVisits} stay as they are` : ""}.
            {preview.scheduleChange ? ` The schedule restarts on ${preview.firstDate}.` : ""}
          </p>
          {preview.assignmentsRemoved ? (
            <p className="text-amber-700">
              {mode === "admin"
                ? `${preview.assignmentsRemoved} cleaner assignment(s) will be removed and need re-dispatch.`
                : "Your cleaner will be re-confirmed for the new schedule."}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="flex gap-2">
        {!preview ? (
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !dirty}
            onClick={() =>
              start(async () => {
                const r =
                  mode === "admin"
                    ? await previewSeriesEditAdminAction(bookingId, changes())
                    : await previewPlanEditAction(bookingId, changes());
                if (r.ok) setPreview(r.preview);
                else toast.error(r.message);
              })
            }
            data-testid="series-preview-btn"
          >
            Preview changes
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r =
                  mode === "admin"
                    ? await applySeriesEditAdminAction(bookingId, changes())
                    : await applyPlanEditAction(bookingId, changes());
                if (r.ok) {
                  toast.success(r.message ?? "Updated");
                  if ("warnings" in r) r.warnings?.forEach((w) => toast.warning(w));
                  setOpen(false);
                  setPreview(null);
                  router.refresh();
                } else toast.error(r.message);
              })
            }
            data-testid="series-apply"
          >
            Confirm for all future visits
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setOpen(false);
            setPreview(null);
            setV({ ...current, startDate: "" });
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
