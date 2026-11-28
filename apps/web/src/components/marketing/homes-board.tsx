import { cn } from "cn";
import { serviceHue } from "@/modules/marketing/hues";
import { RoomStrip, homeBlocks } from "./room-strip";

/**
 * The picture beside a sign-in or a headline: a week of homes, one strip each, in the colour of
 * the service booked, on a grid of ten rooms. The nearer the visit, the taller it is drawn.
 */
const HOMES: { slug: string; name: string; bedrooms: number; bathrooms: number }[] = [
  { slug: "deep", name: "Deep clean", bedrooms: 3, bathrooms: 2 },
  { slug: "standard", name: "Standard", bedrooms: 2, bathrooms: 1 },
  { slug: "move-in-out", name: "Move out", bedrooms: 4, bathrooms: 2.5 },
  { slug: "airbnb", name: "Airbnb", bedrooms: 1, bathrooms: 1 },
  { slug: "condo", name: "Condo", bedrooms: 2, bathrooms: 1.5 },
  { slug: "post-renovation", name: "After the reno", bedrooms: 3, bathrooms: 2.5 },
  { slug: "standard", name: "Every 2 weeks", bedrooms: 2, bathrooms: 2 },
  { slug: "deep", name: "Spring clean", bedrooms: 1, bathrooms: 1 },
];

const HEIGHTS = ["h-36", "h-28", "h-24", "h-20", "h-16", "h-14", "h-12", "h-10"];

export function HomesBoard({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-[3px]", className)} aria-hidden>
      {HOMES.map((h, i) => (
        <RoomStrip
          key={i}
          hue={serviceHue(h.slug)}
          blocks={homeBlocks({ bedrooms: h.bedrooms, bathrooms: h.bathrooms, of: 10 }).map(
            (b, j) =>
              j === 0 ? { ...b, label: h.name, count: undefined } : { kind: b.kind, n: b.n },
          )}
          size={i < 3 ? "lg" : i < 5 ? "md" : "sm"}
          className={cn(HEIGHTS[i] ?? "h-8", "animate-rise motion-reduce:animate-none")}
        />
      ))}
    </div>
  );
}
