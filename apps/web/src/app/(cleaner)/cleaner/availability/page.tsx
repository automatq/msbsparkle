import { AvailabilityForm } from "@/components/cleaner/availability-form";
import { currentCleaner } from "@/modules/cleaner/current";
import { getAvailability } from "@/modules/cleaner/service";

export const dynamic = "force-dynamic";

export default async function AvailabilityPage() {
  const cleaner = await currentCleaner();
  if (!cleaner) return null;
  const { timezone, availability, timeOff } = await getAvailability(cleaner);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Availability</h1>
        <p className="text-xs text-muted-foreground">Times are in {timezone.replace("_", " ")}.</p>
      </div>
      <AvailabilityForm
        initial={availability.map((a) => ({
          weekday: a.weekday,
          startLocal: a.startLocal,
          endLocal: a.endLocal,
        }))}
      />
      {timeOff.length ? (
        <section>
          <p className="mb-1 text-sm font-medium">Time off</p>
          <ul className="space-y-1 text-sm">
            {timeOff.map((t) => (
              <li key={t.id} className="rounded-lg border p-2">
                {t.startsAt.toISOString().slice(0, 10)} → {t.endsAt.toISOString().slice(0, 10)} ·{" "}
                {t.status.toLowerCase()}
                {t.reason ? ` · ${t.reason}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
