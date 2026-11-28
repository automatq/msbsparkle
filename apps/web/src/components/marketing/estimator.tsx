"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cn } from "cn";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { quoteAction } from "@/modules/bookings/actions";
import { serviceHue } from "@/modules/marketing/hues";
import { formatCents } from "@/modules/shared/money";
import { RoomStrip, homeBlocks } from "./room-strip";

/** The instant price: a standard clean, with the home drawn as it is described. */
export function Estimator({ className }: { className?: string }) {
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
    <form onSubmit={submit} className={cn("space-y-5", className)} data-testid="estimator">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-2 sm:col-span-1">
          <Label htmlFor="est-postal">Postal code</Label>
          <Input
            id="est-postal"
            value={postal}
            onChange={(e) => {
              setPostal(e.target.value.toUpperCase());
              setResult(null);
            }}
            placeholder="M5V 2T6"
            required
          />
        </div>
        <div className="col-span-2 space-y-2 sm:col-span-1">
          <Label htmlFor="est-freq">How often</Label>
          <NativeSelect
            id="est-freq"
            value={frequency}
            onChange={(e) => {
              setFrequency(e.target.value as typeof frequency);
              setResult(null);
            }}
          >
            <option value="ONE_TIME">Once</option>
            <option value="WEEKLY">Weekly (save 20%)</option>
            <option value="BIWEEKLY">Every 2 weeks (save 15%)</option>
            <option value="EVERY_4_WEEKS">Every 4 weeks (save 10%)</option>
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="est-bed">Bedrooms</Label>
          <NativeSelect
            id="est-bed"
            value={bedrooms}
            onChange={(e) => {
              setBedrooms(Number(e.target.value));
              setResult(null);
            }}
          >
            {[0, 1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n === 0 ? "Studio" : n === 6 ? "6+" : n}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="est-bath">Bathrooms</Label>
          <NativeSelect
            id="est-bath"
            value={bathrooms}
            onChange={(e) => {
              setBathrooms(Number(e.target.value));
              setResult(null);
            }}
          >
            {[1, 1.5, 2, 2.5, 3, 3.5, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n === 5 ? "5+" : n}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <RoomStrip
        hue={serviceHue("standard")}
        blocks={homeBlocks({ bedrooms, bathrooms })}
        decorative
      />

      {result ? (
        <div className="flex flex-wrap items-end justify-between gap-4 border-t border-foreground pt-4">
          <div>
            <p className="wide text-4xl leading-none font-semibold" data-testid="estimate-total">
              {formatCents(result.total)}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              A standard clean in {result.region}, tax included. Paid after it&apos;s done.
            </p>
          </div>
          <Link href={bookHref} className={buttonVariants({ size: "lg", className: "h-12 px-6" })}>
            Book this
            <ArrowRight aria-hidden />
          </Link>
        </div>
      ) : (
        <Button type="submit" size="lg" className="h-12 w-full px-6 text-base" disabled={busy}>
          {busy ? "Working it out…" : "See my price"}
        </Button>
      )}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </form>
  );
}
