"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { quoteAction } from "@/modules/bookings/actions";
import { formatCents } from "@/modules/shared/money";

export function Estimator() {
  const [postal, setPostal] = useState("");
  const [bedrooms, setBedrooms] = useState(2);
  const [bathrooms, setBathrooms] = useState(1);
  const [frequency, setFrequency] = useState<"ONE_TIME" | "WEEKLY" | "BIWEEKLY" | "EVERY_4_WEEKS">(
    "ONE_TIME",
  );
  const [result, setResult] = useState<{ total: number; region: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await quoteAction({
      postalCode: postal,
      serviceSlug: "standard",
      bedrooms,
      bathrooms,
      extras: [],
      frequency,
    });
    setBusy(false);
    if (res.ok) setResult({ total: res.data.quote.totalCents, region: res.data.region.name });
    else {
      setResult(null);
      setError(res.error.message);
    }
  }

  const bookHref = `/book?postal=${encodeURIComponent(postal)}&service=standard&bedrooms=${bedrooms}&bathrooms=${bathrooms}&frequency=${frequency}`;

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-xl border bg-background p-6 shadow-sm"
      data-testid="estimator"
    >
      <h2 className="font-medium">Get an instant price</h2>
      <div className="space-y-2">
        <Label htmlFor="est-postal">Postal code</Label>
        <Input
          id="est-postal"
          value={postal}
          onChange={(e) => setPostal(e.target.value.toUpperCase())}
          placeholder="M5V 2T6"
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="est-bed">Bedrooms</Label>
          <select
            id="est-bed"
            className="h-9 w-full rounded-lg border bg-background px-2 text-sm"
            value={bedrooms}
            onChange={(e) => setBedrooms(Number(e.target.value))}
          >
            {[0, 1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n === 0 ? "Studio" : n === 6 ? "6+" : n}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="est-bath">Bathrooms</Label>
          <select
            id="est-bath"
            className="h-9 w-full rounded-lg border bg-background px-2 text-sm"
            value={bathrooms}
            onChange={(e) => setBathrooms(Number(e.target.value))}
          >
            {[1, 1.5, 2, 2.5, 3, 3.5, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n === 5 ? "5+" : n}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="est-freq">Frequency</Label>
        <select
          id="est-freq"
          className="h-9 w-full rounded-lg border bg-background px-2 text-sm"
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as typeof frequency)}
        >
          <option value="ONE_TIME">One-time</option>
          <option value="WEEKLY">Weekly (save 20%)</option>
          <option value="BIWEEKLY">Every 2 weeks (save 15%)</option>
          <option value="EVERY_4_WEEKS">Every 4 weeks (save 10%)</option>
        </select>
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Calculating…" : "See my price"}
      </Button>
      {result ? (
        <div className="rounded-lg bg-muted/40 p-3 text-sm">
          <p>
            Standard clean in {result.region}:{" "}
            <span className="text-lg font-semibold" data-testid="estimate-total">
              {formatCents(result.total)}
            </span>{" "}
            incl. tax
          </p>
          <Link href={bookHref} className="mt-2 inline-block text-sm font-medium underline">
            Book this →
          </Link>
        </div>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </form>
  );
}
