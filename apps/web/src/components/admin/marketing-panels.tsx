"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  saveCityAction,
  savePromoAction,
  setApplicationStatusAction,
  togglePromoAction,
  type CityInput,
  type PromoInput,
} from "@/modules/admin/marketing-actions";
import { ActionButton } from "./ui";

export function PromoForm({
  initial,
  regions,
  onSaved,
}: {
  initial: PromoInput;
  regions: { id: string; name: string }[];
  onSaved?: () => void;
}) {
  const [v, setV] = useState<PromoInput>(initial);
  const set = <K extends keyof PromoInput>(k: K, val: PromoInput[K]) =>
    setV((s) => ({ ...s, [k]: val }));
  return (
    <div className="grid gap-3 text-sm sm:grid-cols-2">
      <div className="space-y-1">
        <Label>Code</Label>
        <Input
          value={v.code}
          onChange={(e) => set("code", e.target.value.toUpperCase())}
          data-testid="promo-code"
        />
      </div>
      <div className="space-y-1">
        <Label>Type</Label>
        <select
          value={v.type}
          onChange={(e) => set("type", e.target.value as PromoInput["type"])}
          className="h-9 w-full rounded-lg border bg-background px-2"
        >
          <option value="PERCENT">Percent off</option>
          <option value="FIXED">Fixed $ off</option>
        </select>
      </div>
      <div className="space-y-1">
        <Label>{v.type === "PERCENT" ? "Percent (%)" : "Amount ($)"}</Label>
        <Input
          type="number"
          value={v.value / 100}
          onChange={(e) => set("value", Math.round(Number(e.target.value) * 100))}
          data-testid="promo-value"
        />
      </div>
      <div className="space-y-1">
        <Label>Applies to</Label>
        <select
          value={v.appliesTo}
          onChange={(e) => set("appliesTo", e.target.value as PromoInput["appliesTo"])}
          className="h-9 w-full rounded-lg border bg-background px-2"
        >
          <option value="FIRST_JOB">First clean only</option>
          <option value="ALL_JOBS">Every clean</option>
        </select>
      </div>
      <div className="space-y-1">
        <Label>Min subtotal ($)</Label>
        <Input
          type="number"
          value={(v.minSubtotalCents ?? 0) / 100}
          onChange={(e) => set("minSubtotalCents", Math.round(Number(e.target.value) * 100))}
        />
      </div>
      <div className="space-y-1">
        <Label>Max discount ($, blank = none)</Label>
        <Input
          type="number"
          value={v.maxDiscountCents == null ? "" : v.maxDiscountCents / 100}
          onChange={(e) =>
            set(
              "maxDiscountCents",
              e.target.value === "" ? null : Math.round(Number(e.target.value) * 100),
            )
          }
        />
      </div>
      <div className="space-y-1">
        <Label>Max redemptions (blank = unlimited)</Label>
        <Input
          type="number"
          value={v.maxRedemptions ?? ""}
          onChange={(e) =>
            set("maxRedemptions", e.target.value === "" ? null : Number(e.target.value))
          }
        />
      </div>
      <div className="space-y-1">
        <Label>Per customer limit</Label>
        <Input
          type="number"
          value={v.perCustomerLimit ?? 1}
          onChange={(e) => set("perCustomerLimit", Number(e.target.value))}
        />
      </div>
      <div className="space-y-1">
        <Label>Starts</Label>
        <Input
          type="date"
          value={v.startsAt ?? ""}
          onChange={(e) => set("startsAt", e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label>Ends</Label>
        <Input type="date" value={v.endsAt ?? ""} onChange={(e) => set("endsAt", e.target.value)} />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label>Regions (none = all)</Label>
        <div className="flex flex-wrap gap-2 text-xs">
          {regions.map((r) => (
            <label key={r.id} className="flex items-center gap-1 rounded-full border px-2 py-1">
              <input
                type="checkbox"
                checked={(v.regionIds ?? []).includes(r.id)}
                onChange={(e) =>
                  set(
                    "regionIds",
                    e.target.checked
                      ? [...(v.regionIds ?? []), r.id]
                      : (v.regionIds ?? []).filter((x) => x !== r.id),
                  )
                }
              />
              {r.name}
            </label>
          ))}
        </div>
      </div>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={!!v.newCustomersOnly}
          onChange={(e) => set("newCustomersOnly", e.target.checked)}
        />
        New customers only
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={v.active !== false}
          onChange={(e) => set("active", e.target.checked)}
        />
        Active
      </label>
      <div className="sm:col-span-2">
        <ActionButton action={() => savePromoAction(v)} variant="default" onDone={onSaved}>
          Save promo
        </ActionButton>
      </div>
    </div>
  );
}

export function PromoToggle({ id, active }: { id: string; active: boolean }) {
  return (
    <ActionButton action={() => togglePromoAction(id, !active)} size="xs">
      {active ? "Deactivate" : "Activate"}
    </ActionButton>
  );
}

export function ApplicationStatus({ id, status }: { id: string; status: string }) {
  const [s, setS] = useState(status);
  const [notes, setNotes] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <select
        value={s}
        onChange={(e) => setS(e.target.value)}
        className="h-8 rounded-lg border bg-background px-2"
      >
        {["NEW", "REVIEWING", "INTERVIEW", "HIRED", "REJECTED"].map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Note"
        className="h-8 rounded-lg border px-2"
      />
      <ActionButton action={() => setApplicationStatusAction(id, s as "NEW", notes)} size="xs">
        Update
      </ActionButton>
    </div>
  );
}

export function CityEditor({ id, initial }: { id: string; initial: CityInput }) {
  const [v, setV] = useState<CityInput>(initial);
  const [faqText, setFaqText] = useState(
    (initial.faqs ?? []).map((f) => `${f.q}\n${f.a}`).join("\n\n"),
  );
  const parseFaqs = () =>
    faqText
      .split(/\n\s*\n/)
      .map((b) => b.trim())
      .filter(Boolean)
      .map((b) => {
        const [q, ...rest] = b.split("\n");
        return { q: q.trim(), a: rest.join(" ").trim() };
      })
      .filter((f) => f.q && f.a);
  return (
    <div className="grid gap-3 text-sm">
      <div className="space-y-1">
        <Label>City name</Label>
        <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label>SEO title</Label>
        <Input
          value={v.seoTitle ?? ""}
          onChange={(e) => setV({ ...v, seoTitle: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label>SEO description</Label>
        <Textarea
          rows={2}
          value={v.seoDescription ?? ""}
          onChange={(e) => setV({ ...v, seoDescription: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label>Intro paragraph</Label>
        <Textarea
          rows={3}
          value={v.intro ?? ""}
          onChange={(e) => setV({ ...v, intro: e.target.value })}
          data-testid="city-intro"
        />
      </div>
      <div className="space-y-1">
        <Label>Neighbourhoods (comma separated)</Label>
        <Input
          value={(v.neighborhoods ?? []).join(", ")}
          onChange={(e) =>
            setV({
              ...v,
              neighborhoods: e.target.value
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean),
            })
          }
        />
      </div>
      <div className="space-y-1">
        <Label>FAQs (question on one line, answer on the next, blank line between)</Label>
        <Textarea rows={8} value={faqText} onChange={(e) => setFaqText(e.target.value)} />
      </div>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={v.active !== false}
          onChange={(e) => setV({ ...v, active: e.target.checked })}
        />
        Published
      </label>
      <div>
        <ActionButton
          action={() => saveCityAction(id, { ...v, faqs: parseFaqs() })}
          variant="default"
        >
          Save and republish
        </ActionButton>
      </div>
    </div>
  );
}
