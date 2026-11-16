"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitApplicationAction } from "@/modules/marketing/actions";

export function ApplyForm({ cities }: { cities: string[] }) {
  const [v, setV] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    city: cities[0] ?? "",
    experience: "",
    hasVehicle: false,
  });
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (done)
    return (
      <p
        className="rounded-xl border bg-emerald-50 p-4 text-sm text-emerald-900"
        data-testid="apply-done"
      >
        Thanks! We review applications within two business days and will text you to set up a call.
      </p>
    );
  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await submitApplicationAction(v);
          if (r.ok) setDone(true);
          else setError(r.message);
        });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="a-first">First name</Label>
        <Input
          id="a-first"
          value={v.firstName}
          onChange={(e) => setV({ ...v, firstName: e.target.value })}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="a-last">Last name</Label>
        <Input
          id="a-last"
          value={v.lastName}
          onChange={(e) => setV({ ...v, lastName: e.target.value })}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="a-email">Email</Label>
        <Input
          id="a-email"
          type="email"
          value={v.email}
          onChange={(e) => setV({ ...v, email: e.target.value })}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="a-phone">Mobile</Label>
        <Input
          id="a-phone"
          type="tel"
          value={v.phone}
          onChange={(e) => setV({ ...v, phone: e.target.value })}
          required
        />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="a-city">City</Label>
        <select
          id="a-city"
          value={v.city}
          onChange={(e) => setV({ ...v, city: e.target.value })}
          className="h-9 w-full rounded-lg border bg-background px-2 text-sm"
        >
          {cities.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="a-exp">Cleaning experience (optional)</Label>
        <Textarea
          id="a-exp"
          value={v.experience}
          onChange={(e) => setV({ ...v, experience: e.target.value })}
          rows={3}
        />
      </div>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input
          type="checkbox"
          checked={v.hasVehicle}
          onChange={(e) => setV({ ...v, hasVehicle: e.target.checked })}
        />
        I have reliable transportation
      </label>
      {error ? <p className="text-sm text-destructive sm:col-span-2">{error}</p> : null}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Apply"}
        </Button>
      </div>
    </form>
  );
}
