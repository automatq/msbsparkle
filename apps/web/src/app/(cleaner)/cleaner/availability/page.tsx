import { AvailabilityForm } from "@/components/cleaner/availability-form";
import { requireRole } from "@/modules/auth/session";
import { cleanerForUser } from "@/modules/cleaner/queries";
import { prisma } from "@/modules/db/client";

export const dynamic = "force-dynamic";

export default async function AvailabilityPage() {
  const ctx = await requireRole("/login/phone", "CLEANER", "SUPER_ADMIN");
  const cleaner = await cleanerForUser(ctx.userId);
  if (!cleaner) return null;
  const [availability, timeOff] = await Promise.all([
    prisma.cleanerAvailability.findMany({
      where: { cleanerId: cleaner.id },
      orderBy: { weekday: "asc" },
    }),
    prisma.timeOff.findMany({
      where: { cleanerId: cleaner.id, endsAt: { gte: new Date() } },
      orderBy: { startsAt: "asc" },
    }),
  ]);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Availability</h1>
        <p className="text-xs text-muted-foreground">
          Times are in {cleaner.homeRegion.timezone.replace("_", " ")}.
        </p>
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
