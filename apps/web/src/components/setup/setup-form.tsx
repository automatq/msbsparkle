"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { completeSetupAction } from "@/modules/setup/actions";
import { country } from "@/modules/shared/country";
import { brandName } from "@/modules/shared/site";

const selectCls = "h-9 w-full rounded-lg border bg-background px-2 text-sm";

export function SetupForm({ defaultTimezone }: { defaultTimezone: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState("");
  const [v, setV] = useState({
    companyName: brandName,
    supportEmail: "",
    supportPhone: "",
    adminName: "",
    adminEmail: "",
    adminPassword: "",
  });
  const [withRegion, setWithRegion] = useState(true);
  const [r, setR] = useState({
    name: "",
    province: "",
    timezone: defaultTimezone,
    areas: "",
    taxName: "",
    taxRate: "",
  });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setV((s) => ({ ...s, [k]: e.target.value }));
  const setRegion =
    (k: keyof typeof r) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setR((s) => ({ ...s, [k]: e.target.value }));

  return (
    <form
      className="mt-8 space-y-8"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await completeSetupAction(key, { ...v, region: withRegion ? r : null });
          if (!res.ok) {
            setError(res.message);
            return;
          }
          toast.success("Setup complete. Sign in with your new admin account.");
          router.push("/admin/login");
        });
      }}
    >
      <Section title="Setup key">
        <Field
          id="setup-key"
          label="Setup key"
          hint="The AUTH_SECRET value you set when deploying. It proves you own this deployment."
        >
          <Input
            id="setup-key"
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoComplete="off"
            required
          />
        </Field>
      </Section>

      <Section title="Company">
        <Field id="company-name" label="Company name">
          <Input id="company-name" value={v.companyName} onChange={set("companyName")} required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="support-email" label="Support email" hint="Shown to customers.">
            <Input
              id="support-email"
              type="email"
              value={v.supportEmail}
              onChange={set("supportEmail")}
              required
            />
          </Field>
          <Field id="support-phone" label="Support phone (optional)">
            <Input id="support-phone" value={v.supportPhone} onChange={set("supportPhone")} />
          </Field>
        </div>
      </Section>

      <Section title="Your admin account">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="admin-name" label="Your name">
            <Input id="admin-name" value={v.adminName} onChange={set("adminName")} required />
          </Field>
          <Field id="admin-email" label="Admin email">
            <Input
              id="admin-email"
              type="email"
              value={v.adminEmail}
              onChange={set("adminEmail")}
              autoComplete="username"
              required
            />
          </Field>
        </div>
        <Field id="admin-password" label="Password" hint="At least 12 characters.">
          <Input
            id="admin-password"
            type="password"
            value={v.adminPassword}
            onChange={set("adminPassword")}
            autoComplete="new-password"
            minLength={12}
            required
          />
        </Field>
      </Section>

      <Section title="First region">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={withRegion}
            onChange={(e) => setWithRegion(e.target.checked)}
          />
          Set up the first region now (you can add more later in the admin)
        </label>
        {withRegion ? (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field id="region-name" label="Region name">
                <Input
                  id="region-name"
                  value={r.name}
                  onChange={setRegion("name")}
                  placeholder={country.code === "US" ? "Austin" : "Toronto"}
                  required
                />
              </Field>
              <Field id="region-province" label={country.subdivisionLabel}>
                <select
                  id="region-province"
                  value={r.province}
                  onChange={setRegion("province")}
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
              <Field id="region-tz" label="Timezone">
                <select
                  id="region-tz"
                  value={r.timezone}
                  onChange={setRegion("timezone")}
                  className={selectCls}
                >
                  {country.timezones.map((tz) => (
                    <option key={tz}>{tz}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field
              id="region-areas"
              label={`${country.areaLabel}s served`}
              hint={`${country.areaHint}. With at least one, the region starts taking bookings right away.`}
            >
              <textarea
                id="region-areas"
                value={r.areas}
                onChange={(e) => setR((s) => ({ ...s, areas: e.target.value }))}
                rows={2}
                placeholder={country.code === "US" ? "78701 78702 787" : "M5V M5W M6A"}
                className="w-full rounded-lg border bg-background px-2 py-1.5 font-mono text-sm"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="tax-name" label="Tax name (optional)">
                <Input
                  id="tax-name"
                  value={r.taxName}
                  onChange={setRegion("taxName")}
                  placeholder={country.code === "US" ? "Sales tax" : "HST"}
                />
              </Field>
              <Field id="tax-rate" label="Tax rate (%)">
                <Input
                  id="tax-rate"
                  inputMode="decimal"
                  value={r.taxRate}
                  onChange={setRegion("taxRate")}
                  placeholder="13"
                />
              </Field>
            </div>
          </>
        ) : null}
      </Section>

      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} data-testid="complete-setup">
        {pending ? "Setting up…" : "Finish setup"}
      </Button>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="border-b pb-1 font-medium">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
