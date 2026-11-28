"use client";

import type { ReactNode } from "react";
import { cn } from "cn";
import type { Hue } from "@/modules/marketing/hues";
import { formatCents } from "@/modules/shared/money";
import type { QuoteResult } from "@/modules/pricing/types";

/**
 * The booking's inspector: what is being booked, the home drawn as its rooms, and the price line
 * by line. It stands beside the steps, with the key under it.
 */
export function QuoteSummary({
  quote,
  loading,
  serviceName,
  hue,
  picture,
  place,
  note,
  labels = {},
}: {
  quote: QuoteResult | null;
  loading?: boolean;
  serviceName?: string;
  hue?: Hue;
  /** The home as a room strip, in the service's colour. */
  picture?: ReactNode;
  /** Where, e.g. "Toronto, ON". */
  place?: string;
  /** A line at the bottom: tax, who to call. */
  note?: string;
  /** Optional slug -> display name map (e.g. extras). */
  labels?: Record<string, string>;
}) {
  const visible = quote?.lines.filter((l) => l.amountCents !== 0 || l.step === "EXTRA") ?? [];
  return (
    <section aria-label="Your price" data-hue={hue} className="rounded-3xl bg-well p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="wide text-2xl leading-tight font-semibold">{serviceName ?? "Your clean"}</p>
          {place ? <p className="mt-1 text-sm text-muted-foreground">{place}</p> : null}
        </div>
        {loading ? (
          <span className="mt-1.5 shrink-0 text-xs text-muted-foreground">Updating…</span>
        ) : null}
      </div>
      {picture ? <div className="mt-5">{picture}</div> : null}
      {quote ? (
        <div
          className={cn("mt-5 transition-opacity", loading && "opacity-60")}
          data-testid="quote-summary"
        >
          <ul className="border-t">
            {visible.map((l, i) => (
              <li
                key={`${l.step}-${l.key}-${i}`}
                className="flex justify-between gap-3 border-b py-2.5 text-sm"
              >
                <span className="text-muted-foreground">
                  {l.step === "EXTRA" ? (labels[l.key] ?? l.label) : l.label}
                  {l.qty > 1 && l.step === "EXTRA" ? ` × ${l.qty}` : ""}
                </span>
                <span className={cn("narrow", l.amountCents < 0 && "text-success")}>
                  {formatCents(l.amountCents)}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex items-baseline justify-between gap-3 pt-4">
            <span className="font-semibold">Total</span>
            <span className="wide text-3xl font-semibold" data-testid="quote-total">
              {formatCents(quote.totalCents)}
            </span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            About {Math.round(quote.estimatedMinutes / 60)}h{" "}
            {quote.estimatedMinutes % 60 ? `${quote.estimatedMinutes % 60}m` : ""} of cleaning.
            Charged after the clean is complete.
          </p>
          {quote.warnings.map((w) => (
            <p key={w} className="mt-1 text-xs text-warning">
              {w}
            </p>
          ))}
        </div>
      ) : (
        <p className="mt-5 border-t pt-4 text-sm text-muted-foreground">
          {loading ? "Working out your price…" : "Your price appears here as you go."}
        </p>
      )}
      {note ? <p className="mt-4 text-xs text-muted-foreground">{note}</p> : null}
    </section>
  );
}
