"use client";

import { useEffect, useState } from "react";
import type { TrackingView } from "@/modules/tracking/service";
import { locale } from "@/modules/shared/country";

const POLL_MS = 15_000;

function timeIn(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone }).format(
    new Date(iso),
  );
}

function minutesUntil(iso: string) {
  return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60_000));
}

/** The customer's live view: status, ETA and a map while the cleaner is on the way. */
export function TrackingLive({ token, initial }: { token: string; initial: TrackingView }) {
  const [view, setView] = useState(initial);
  const live = view.status === "on_the_way" || view.status === "scheduled";

  useEffect(() => {
    if (!live) return;
    let stopped = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      const res = await fetch(`/api/track/${token}`, { cache: "no-store" }).catch(() => null);
      if (!stopped && res?.ok) setView((await res.json()) as TrackingView);
    };
    const id = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [token, live]);

  const name = view.cleaner.firstName;
  const headline = {
    scheduled: `${name} is scheduled for your clean`,
    on_the_way: `${name} is on the way`,
    arrived: `${name} has arrived`,
    done: "Your clean is complete",
    cancelled: "This visit was cancelled",
  }[view.status];

  return (
    <div className="space-y-4" data-testid="tracking">
      <div className="flex items-center gap-3">
        {view.cleaner.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- cleaner photos can be on any host
          <img src={view.cleaner.photoUrl} alt="" className="size-14 rounded-full object-cover" />
        ) : (
          <div className="flex size-14 items-center justify-center rounded-full bg-muted text-xl font-semibold">
            {name.slice(0, 1)}
          </div>
        )}
        <div>
          <h1 className="text-xl font-semibold" data-testid="tracking-headline">
            {headline}
          </h1>
          <p className="text-sm text-muted-foreground">
            Arrival window {view.window.start}–{view.window.end}
          </p>
        </div>
      </div>

      {view.status === "on_the_way" ? (
        <div className="rounded-xl border p-4">
          {view.etaAt ? (
            <>
              <p className="text-sm text-muted-foreground">Estimated arrival</p>
              <p className="text-3xl font-semibold" data-testid="tracking-eta">
                {timeIn(view.etaAt, view.timezone)}
              </p>
              <p className="text-sm text-muted-foreground">
                {minutesUntil(view.etaAt) <= 1
                  ? "Arriving now"
                  : `About ${minutesUntil(view.etaAt)} min away`}
              </p>
            </>
          ) : (
            <p className="text-sm">We&apos;ll show an arrival time as soon as we have one.</p>
          )}
        </div>
      ) : null}

      {view.mapUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- Mapbox static image, refreshed on poll
        <img
          src={view.mapUrl}
          alt={`Map showing ${name} and your home`}
          className="w-full rounded-xl border"
          width={600}
          height={360}
        />
      ) : null}

      <p className="text-xs text-muted-foreground">
        {view.status === "on_the_way"
          ? "This page updates by itself. Location is shared only while your cleaner is on the way."
          : view.status === "scheduled"
            ? "You'll see live updates here once your cleaner is on the way."
            : null}
      </p>
    </div>
  );
}
