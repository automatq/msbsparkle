import type { CSSProperties } from "react";
import { cn } from "cn";
import type { Hue } from "@/modules/marketing/hues";

/**
 * A home drawn as a strip of rooms in its service's colour: one cell per bedroom and bathroom
 * (a half bathroom hatched), the kitchen and living room, and any empty cells up to `of`. The
 * same everywhere: the estimator, the booking summary, the service pages.
 */
type Block = { kind: "on" | "half" | "off"; n: number; label?: string; count?: string };

export function homeBlocks({
  bedrooms,
  bathrooms,
  common = true,
  extras = 0,
  of,
}: {
  bedrooms: number;
  bathrooms: number;
  common?: boolean;
  extras?: number;
  of?: number;
}): Block[] {
  const whole = Math.floor(bathrooms);
  const half = bathrooms - whole >= 0.5;
  const blocks: Block[] = [
    {
      kind: "on",
      n: Math.max(1, bedrooms),
      label: bedrooms === 0 ? "Studio" : bedrooms === 1 ? "Bedroom" : "Bedrooms",
      count: bedrooms === 0 ? undefined : String(bedrooms),
    },
  ];
  if (whole > 0)
    blocks.push({
      kind: "on",
      n: whole,
      label: whole === 1 && !half ? "Bathroom" : "Bathrooms",
      count: half ? `${whole}½` : String(whole),
    });
  if (half) blocks.push({ kind: "half", n: 1 });
  if (common) blocks.push({ kind: "on", n: 2, label: "Kitchen, living" });
  if (extras > 0) blocks.push({ kind: "off", n: extras, label: "Extras", count: `+${extras}` });
  const used = blocks.reduce((s, b) => s + b.n, 0);
  if (of && of > used) blocks.push({ kind: "off", n: of - used });
  return blocks;
}

const SIZES = {
  lg: { strip: "h-28 gap-[3px]", block: "rounded-xl", labels: true, count: "text-2xl" },
  md: { strip: "h-16 gap-[3px]", block: "rounded-lg", labels: true, count: "text-base" },
  sm: { strip: "h-5 gap-0.5", block: "rounded-[5px]", labels: false, count: "" },
} as const;

export function RoomStrip({
  hue,
  blocks,
  size = "md",
  label,
  className,
}: {
  hue: Hue;
  blocks: Block[];
  size?: keyof typeof SIZES;
  /** Read out instead of the blocks, e.g. "Deep cleaning, 3 bedrooms, 2 bathrooms". */
  label?: string;
  className?: string;
}) {
  const s = SIZES[size];
  const said =
    label ??
    blocks
      .filter((b) => b.label)
      .map((b) => `${b.count ?? ""} ${b.label}`.trim())
      .join(", ");
  return (
    <div
      data-hue={hue}
      role="img"
      aria-label={said}
      className={cn("flex w-full", s.strip, className)}
    >
      {blocks.map((b, i) => (
        <div
          key={i}
          style={{ flexGrow: b.n, flexBasis: 0, "--n": b.n } as CSSProperties}
          className={cn(
            "@container relative min-w-0 overflow-hidden transition-[flex-grow] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none",
            s.block,
            b.kind === "on" ? "cells-on" : b.kind === "half" ? "cells-half" : "cells-off",
          )}
        >
          {s.labels && b.kind !== "half" && (b.count || b.label) ? (
            <div
              className={cn(
                "absolute inset-0 flex flex-col justify-between p-2.5",
                b.kind === "on" ? "text-hue-ink" : "text-hue-text",
              )}
              aria-hidden
            >
              <span className={cn("wide leading-none font-semibold", s.count)}>{b.count}</span>
              {/* A label only where the block is wide enough to say it. */}
              <span className="hidden truncate text-xs font-medium @min-[5.5rem]:block">
                {b.label}
              </span>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
