import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { sampleHome, serviceHue } from "@/modules/marketing/hues";
import { RoomStrip, homeBlocks } from "./room-strip";

/** Services as a list: each in its colour, its home drawn beside its name. Hairlines, no cards. */
export function ServiceRows({
  services,
}: {
  services: { slug: string; name: string; line: string | null }[];
}) {
  return (
    <ul className="border-t border-foreground">
      {services.map((s) => (
        <li key={s.slug} className="border-b">
          <Link
            href={`/services/${s.slug}`}
            data-hue={serviceHue(s.slug)}
            className="group grid items-center gap-x-6 gap-y-3 py-5 transition-colors sm:grid-cols-[10rem_1fr_auto] sm:py-6"
          >
            <RoomStrip
              hue={serviceHue(s.slug)}
              blocks={homeBlocks(sampleHome(s.slug))}
              size="sm"
              className="h-9 max-w-40"
              label={s.name}
            />
            <div className="min-w-0">
              <p className="wide text-xl font-semibold transition-colors group-hover:text-hue-text sm:text-2xl">
                {s.name}
              </p>
              {s.line ? <p className="mt-1 text-sm text-muted-foreground">{s.line}</p> : null}
            </div>
            <ArrowRight
              aria-hidden
              className="hidden size-5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground sm:block"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}
