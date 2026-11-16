"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addServiceAreasAction,
  addTaxRateAction,
  createRegionAction,
  deleteTaxRateAction,
  endTaxRateAction,
  removeServiceAreaAction,
  setServiceAreaActiveAction,
} from "@/modules/admin/region-actions";
import { country } from "@/modules/shared/country";
import { ActionButton } from "./ui";

const selectCls = "h-9 w-full rounded-lg border bg-background px-2 text-sm";

// ── New region ─────────────────────────────────────────────────────────────

export function NewRegionForm({ defaultTimezone }: { defaultTimezone: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState({
    name: "",
    province: "",
    timezone: defaultTimezone,
    phone: "",
    email: "",
    createCityPage: true,
  });
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) =>
    setV((s) => ({ ...s, [k]: val }));
  return (
    <form
      className="grid max-w-2xl gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await createRegionAction(v);
          if (!res.ok) {
            toast.error(res.message);
            return;
          }
          toast.success("Region created. Add its service areas next.");
          router.push(`/admin/regions/${res.regionId}`);
        });
      }}
    >
      <Field label="Name" htmlFor="region-name">
        <Input
          id="region-name"
          value={v.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="e.g. Austin"
          required
        />
      </Field>
      <Field label={country.subdivisionLabel} htmlFor="region-province">
        <select
          id="region-province"
          value={v.province}
          onChange={(e) => set("province", e.target.value)}
          className={selectCls}
          required
        >
          <option value="">Choose…</option>
          {country.subdivisions.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Timezone" htmlFor="region-tz">
        <select
          id="region-tz"
          value={v.timezone}
          onChange={(e) => set("timezone", e.target.value)}
          className={selectCls}
        >
          {country.timezones.map((tz) => (
            <option key={tz}>{tz}</option>
          ))}
        </select>
      </Field>
      <Field label="Local phone (optional)" htmlFor="region-phone">
        <Input id="region-phone" value={v.phone} onChange={(e) => set("phone", e.target.value)} />
      </Field>
      <Field label="Local email (optional)" htmlFor="region-email">
        <Input
          id="region-email"
          type="email"
          value={v.email}
          onChange={(e) => set("email", e.target.value)}
        />
      </Field>
      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input
          type="checkbox"
          checked={v.createCityPage}
          onChange={(e) => set("createCityPage", e.target.checked)}
        />
        Create a public city page for it
      </label>
      <p className="text-xs text-muted-foreground sm:col-span-2">
        The region starts as <b>Coming soon</b> with four 2-hour arrival windows (8am–4pm, 4 jobs
        each, closed Sundays). Add its {country.areaLabel}s and switch it to Active when you&apos;re
        ready to take bookings.
      </p>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending} data-testid="create-region">
          {pending ? "Creating…" : "Create region"}
        </Button>
      </div>
    </form>
  );
}

// ── Service areas ──────────────────────────────────────────────────────────

export function ServiceAreaPanel({
  regionId,
  areas,
}: {
  regionId: string;
  areas: { id: string; postalPrefix: string; active: boolean }[];
}) {
  const [text, setText] = useState("");
  return (
    <div className="space-y-3 text-sm">
      {areas.length ? (
        <ul className="flex flex-wrap gap-1.5" data-testid="service-areas">
          {areas.map((a) => (
            <li
              key={a.id}
              className={`flex items-center gap-1 rounded-full border py-0.5 pr-1 pl-2.5 font-mono text-xs ${a.active ? "" : "text-muted-foreground line-through"}`}
            >
              {a.postalPrefix}
              <ActionButton
                action={() => setServiceAreaActiveAction(a.id, !a.active)}
                size="xs"
                variant="ghost"
              >
                {a.active ? "Pause" : "Resume"}
              </ActionButton>
              <ActionButton
                action={() => removeServiceAreaAction(a.id)}
                size="xs"
                variant="ghost"
                confirm={`Stop serving ${a.postalPrefix}? Existing bookings are not affected.`}
              >
                ×
              </ActionButton>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">
          No service areas yet. Customers can&apos;t book in this region until you add some.
        </p>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="add-areas">Add {country.areaLabel}s</Label>
        <textarea
          id="add-areas"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder={country.code === "US" ? "78701 78702 787" : "M5V M5W M6A"}
          className="w-full rounded-lg border bg-background px-2 py-1.5 font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          {country.areaHint}. Separate with spaces, commas or new lines.
        </p>
        <ActionButton
          action={() => addServiceAreasAction(regionId, text)}
          onDone={() => setText("")}
          testId="add-areas"
        >
          Add
        </ActionButton>
      </div>
    </div>
  );
}

export function AddRequestedArea({
  prefix,
  regions,
}: {
  prefix: string;
  regions: { id: string; name: string }[];
}) {
  const [regionId, setRegionId] = useState(regions[0]?.id ?? "");
  return (
    <span className="flex items-center gap-1">
      <select
        value={regionId}
        onChange={(e) => setRegionId(e.target.value)}
        className="h-7 rounded-lg border bg-background px-1 text-xs"
        aria-label={`Region for ${prefix}`}
      >
        {regions.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      <ActionButton action={() => addServiceAreasAction(regionId, prefix)} size="xs">
        Add
      </ActionButton>
    </span>
  );
}

// ── Tax rates ──────────────────────────────────────────────────────────────

export function AddTaxRateForm({ today }: { today: string }) {
  const [v, setV] = useState({ province: "", name: "", rate: "", effectiveFrom: today });
  const set = <K extends keyof typeof v>(k: K, val: string) => setV((s) => ({ ...s, [k]: val }));
  return (
    <div className="grid gap-3 sm:grid-cols-5 sm:items-end">
      <Field label={country.subdivisionLabel} htmlFor="tax-province">
        <select
          id="tax-province"
          value={v.province}
          onChange={(e) => set("province", e.target.value)}
          className={selectCls}
        >
          <option value="">Choose…</option>
          {country.subdivisions.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Tax name" htmlFor="tax-name">
        <Input
          id="tax-name"
          value={v.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder={country.code === "US" ? "Sales tax" : "HST"}
        />
      </Field>
      <Field label="Rate (%)" htmlFor="tax-rate">
        <Input
          id="tax-rate"
          inputMode="decimal"
          value={v.rate}
          onChange={(e) => set("rate", e.target.value)}
          placeholder="13"
        />
      </Field>
      <Field label="Starts" htmlFor="tax-from">
        <Input
          id="tax-from"
          type="date"
          value={v.effectiveFrom}
          onChange={(e) => set("effectiveFrom", e.target.value)}
        />
      </Field>
      <ActionButton
        action={() => addTaxRateAction(v)}
        onDone={() => setV({ province: "", name: "", rate: "", effectiveFrom: today })}
        size="default"
        variant="default"
        testId="add-tax"
      >
        Add rate
      </ActionButton>
    </div>
  );
}

export function TaxRateActions({
  id,
  today,
  scheduled,
}: {
  id: string;
  today: string;
  scheduled: boolean;
}) {
  const [date, setDate] = useState(today);
  if (scheduled)
    return (
      <ActionButton
        action={() => deleteTaxRateAction(id)}
        size="xs"
        variant="ghost"
        confirm="Delete this scheduled rate?"
      >
        Delete
      </ActionButton>
    );
  return (
    <span className="flex items-center gap-1">
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="h-7 rounded-lg border px-1 text-xs"
        aria-label="End date"
      />
      <ActionButton
        action={() => endTaxRateAction(id, date)}
        size="xs"
        confirm="Stop charging this tax from that date? New quotes won't include it."
      >
        End
      </ActionButton>
    </span>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
