"use client";

import { useEffect, useRef } from "react";

/**
 * Messages from the embedded booking widget to the page hosting it (see public/embed.js):
 *   { type: "booking-widget:resize", height }        whenever the content height changes
 *   { type: "booking-widget:step" }                   the wizard moved to another step
 *   { type: "booking-widget:complete", bookingNumber } after a booking is made
 * Neither carries personal data, so they are posted to any parent origin.
 */
function post(message: Record<string, unknown>) {
  if (typeof window !== "undefined" && window.parent !== window)
    window.parent.postMessage(message, "*");
}

export function EmbedFrame({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let last = 0;
    const report = () => {
      const height = Math.ceil(el.getBoundingClientRect().height);
      if (height !== last) {
        last = height;
        post({ type: "booking-widget:resize", height });
      }
    };
    const ro = new ResizeObserver(report);
    ro.observe(el);
    report();
    return () => ro.disconnect();
  }, []);
  return <div ref={ref}>{children}</div>;
}

export function EmbedComplete({ bookingNumber }: { bookingNumber: string }) {
  useEffect(() => {
    post({ type: "booking-widget:complete", bookingNumber });
  }, [bookingNumber]);
  return null;
}
