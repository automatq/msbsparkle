"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveCleanerAction, type CleanerInput } from "@/modules/admin/actions";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SKILLS: CleanerInput["skills"] = [
  "DEEP_CLEAN",
  "MOVE_OUT",
  "POST_RENO",
  "COMMERCIAL",
  "AIRBNB",
  "LEAD",
];

export function CleanerForm({
  initial,
  regions,
}: {
  initial: CleanerInput;
  regions: { id: string; name: string }[];
}) {
  const [v, setV] = useState<CleanerInput>(initial);
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = <K extends keyof CleanerInput>(k: K, val: CleanerInput[K]) =>
    setV((s) => ({ ...s, [k]: val }));
  const avail = (d: number) => v.availability.find((a) => a.weekday === d);
  const setAvail = (d: number, on: boolean, startLocal = "08:00", endLocal = "17:00") =>
    set(
      "availability",
      [
        ...v.availability.filter((a) => a.weekday !== d),
        ...(on ? [{ weekday: d, startLocal, endLocal }] : []),
      ].sort((a, b) => a.weekday - b.weekday),
    );

  return (
    <form
      className="grid max-w-3xl gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await saveCleanerAction(v);
          if (res.ok) {
            toast.success("Saved");
            router.push(`/admin/cleaners/${res.id}`);
            router.refresh();
          } else toast.error(res.message);
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <F label="First name">
          <Input value={v.firstName} onChange={(e) => set("firstName", e.target.value)} required />
        </F>
        <F label="Last name">
          <Input value={v.lastName} onChange={(e) => set("lastName", e.target.value)} required />
        </F>
        <F label="Email (login)">
          <Input
            type="email"
            value={v.email}
            onChange={(e) => set("email", e.target.value)}
            required
          />
        </F>
        <F label="Mobile (SMS login)">
          <Input
            type="tel"
            value={v.phone}
            onChange={(e) => set("phone", e.target.value)}
            required
          />
        </F>
        <F label="Home region">
          <select
            value={v.homeRegionId}
            onChange={(e) => set("homeRegionId", e.target.value)}
            className="h-9 w-full rounded-lg border bg-background px-2 text-sm"
          >
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </F>
        <F label="Also serves">
          <div className="flex flex-wrap gap-2 text-xs">
            {regions
              .filter((r) => r.id !== v.homeRegionId)
              .map((r) => (
                <label key={r.id} className="flex items-center gap-1 rounded-full border px-2 py-1">
                  <input
                    type="checkbox"
                    checked={v.regionIds.includes(r.id)}
                    onChange={(e) =>
                      set(
                        "regionIds",
                        e.target.checked
                          ? [...v.regionIds, r.id]
                          : v.regionIds.filter((x) => x !== r.id),
                      )
                    }
                  />
                  {r.name}
                </label>
              ))}
          </div>
        </F>
        <F label="Status">
          <select
            value={v.status}
            onChange={(e) => set("status", e.target.value as CleanerInput["status"])}
            className="h-9 w-full rounded-lg border bg-background px-2 text-sm"
          >
            {["ONBOARDING", "ACTIVE", "INACTIVE", "SUSPENDED"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </F>
        <F label="Background check">
          <select
            value={v.backgroundCheckStatus}
            onChange={(e) =>
              set("backgroundCheckStatus", e.target.value as CleanerInput["backgroundCheckStatus"])
            }
            className="h-9 w-full rounded-lg border bg-background px-2 text-sm"
          >
            {["PENDING", "CLEARED", "FAILED", "EXPIRED"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </F>
        <F label="Pay type">
          <select
            value={v.payType}
            onChange={(e) => set("payType", e.target.value as CleanerInput["payType"])}
            className="h-9 w-full rounded-lg border bg-background px-2 text-sm"
          >
            <option value="PERCENT_OF_JOB">Percent of job (pre-tax)</option>
            <option value="HOURLY">Hourly on actual minutes</option>
            <option value="FLAT_PER_JOB">Flat per job</option>
          </select>
        </F>
        {v.payType === "PERCENT_OF_JOB" ? (
          <F label="Percent (%)">
            <Input
              type="number"
              min={0}
              max={100}
              value={(v.payPercentBps ?? 0) / 100}
              onChange={(e) => set("payPercentBps", Math.round(Number(e.target.value) * 100))}
            />
          </F>
        ) : (
          <F label={v.payType === "HOURLY" ? "Hourly rate ($)" : "Flat rate per job ($)"}>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={(v.payRateCents ?? 0) / 100}
              onChange={(e) => set("payRateCents", Math.round(Number(e.target.value) * 100))}
            />
          </F>
        )}
        <F label="Max jobs per day">
          <Input
            type="number"
            min={1}
            max={10}
            value={v.maxJobsPerDay}
            onChange={(e) => set("maxJobsPerDay", Number(e.target.value))}
          />
        </F>
        <F label="Skills">
          <div className="flex flex-wrap gap-2 text-xs">
            {SKILLS.map((s) => (
              <label key={s} className="flex items-center gap-1 rounded-full border px-2 py-1">
                <input
                  type="checkbox"
                  checked={v.skills.includes(s)}
                  onChange={(e) =>
                    set(
                      "skills",
                      e.target.checked ? [...v.skills, s] : v.skills.filter((x) => x !== s),
                    )
                  }
                />
                {s.replaceAll("_", " ")}
              </label>
            ))}
          </div>
        </F>
      </div>
      <div>
        <Label>Weekly availability (home region time)</Label>
        <div className="mt-2 grid gap-1 text-sm">
          {DAYS.map((d, i) => {
            const a = avail(i);
            return (
              <div key={d} className="flex items-center gap-2">
                <label className="flex w-16 items-center gap-1">
                  <input
                    type="checkbox"
                    checked={!!a}
                    onChange={(e) => setAvail(i, e.target.checked)}
                  />
                  {d}
                </label>
                {a ? (
                  <>
                    <input
                      type="time"
                      value={a.startLocal}
                      onChange={(e) => setAvail(i, true, e.target.value, a.endLocal)}
                      className="h-8 rounded-lg border px-2"
                    />
                    <span>–</span>
                    <input
                      type="time"
                      value={a.endLocal}
                      onChange={(e) => setAvail(i, true, a.startLocal, e.target.value)}
                      className="h-8 rounded-lg border px-2"
                    />
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">off</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <F label="Notes">
        <Textarea value={v.notes ?? ""} onChange={(e) => set("notes", e.target.value)} rows={3} />
      </F>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save cleaner"}
        </Button>
      </div>
    </form>
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
