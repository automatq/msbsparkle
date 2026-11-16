"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { requestTimeOffAction, saveAvailabilityAction } from "@/modules/cleaner/actions";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
type Row = { weekday: number; startLocal: string; endLocal: string };

export function AvailabilityForm({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const get = (d: number) => rows.find((r) => r.weekday === d);
  const set = (d: number, on: boolean, s = "08:00", e = "17:00") =>
    setRows((r) => [
      ...r.filter((x) => x.weekday !== d),
      ...(on ? [{ weekday: d, startLocal: s, endLocal: e }] : []),
    ]);
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(res.message ?? "Saved");
        router.refresh();
      } else toast.error(res.message ?? "Failed");
    });
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        {DAYS.map((d, i) => {
          const r = get(i);
          return (
            <div key={d} className="flex items-center gap-2 text-sm">
              <label className="flex w-16 items-center gap-2">
                <input
                  type="checkbox"
                  className="size-5"
                  checked={!!r}
                  onChange={(e) => set(i, e.target.checked)}
                />
                {d}
              </label>
              {r ? (
                <>
                  <input
                    type="time"
                    value={r.startLocal}
                    onChange={(e) => set(i, true, e.target.value, r.endLocal)}
                    className="h-9 rounded-lg border px-2"
                  />
                  <span>–</span>
                  <input
                    type="time"
                    value={r.endLocal}
                    onChange={(e) => set(i, true, r.startLocal, e.target.value)}
                    className="h-9 rounded-lg border px-2"
                  />
                </>
              ) : (
                <span className="text-xs text-muted-foreground">off</span>
              )}
            </div>
          );
        })}
        <Button disabled={pending} onClick={() => run(() => saveAvailabilityAction(rows))}>
          Save availability
        </Button>
      </div>
      <div className="space-y-2 rounded-xl border p-3">
        <p className="text-sm font-medium">Request time off</p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 rounded-lg border px-2"
          />
          <span>to</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 rounded-lg border px-2"
          />
        </div>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (optional)"
          className="h-9 w-full rounded-lg border px-2 text-sm"
        />
        <Button
          variant="outline"
          disabled={pending || !from || !to}
          onClick={() => run(() => requestTimeOffAction(from, to, reason))}
        >
          Request
        </Button>
      </div>
    </div>
  );
}
