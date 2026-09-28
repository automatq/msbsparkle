import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/modules/db/client";
import type { QuoteInput } from "@/modules/pricing/types";
import { MATERIALIZE_HORIZON_DAYS, materializeJobs } from "@/modules/scheduling/materialize";
import { addLocalDays, dateColumnToLocalDate, todayIn } from "@/modules/shared/dates";

/** Rolls every active recurring booking forward so jobs exist 8 weeks ahead. */
export async function runSeriesMaterialization(
  now = new Date(),
): Promise<{ bookings: number; jobs: number }> {
  const bookings = await prisma.booking.findMany({
    where: { status: { in: ["ACTIVE", "PAUSED"] }, frequency: { not: "ONE_TIME" } },
    include: {
      region: true,
      window: true,
      address: true,
      quotes: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  let jobs = 0;
  let touched = 0;
  for (const b of bookings) {
    const today = todayIn(b.region.timezone, now);
    const horizon = addLocalDays(today, MATERIALIZE_HORIZON_DAYS);
    if (b.generatedThrough && dateColumnToLocalDate(b.generatedThrough) >= horizon) continue;
    const template = b.quotes[0]?.inputs as unknown as QuoteInput | undefined;
    if (!template) continue;
    const created = await prisma.$transaction(
      (tx) =>
        materializeJobs(
          tx,
          b,
          {
            timezone: b.region.timezone,
            windowStartLocal: b.window.startLocal,
            windowEndLocal: b.window.endLocal,
            addressSnapshot: {
              line1: b.address.line1,
              line2: b.address.line2,
              city: b.address.city,
              province: b.address.province,
              postalCode: b.address.postalCode,
              entryInstructions: b.address.entryInstructions,
              parkingInstructions: b.address.parkingInstructions,
            } as Prisma.InputJsonValue,
            quoteInput: template,
            firstUpgradeSlug: null,
          },
          horizon,
        ),
      { timeout: 30_000 },
    );
    jobs += created.length;
    touched++;
  }
  return { bookings: touched, jobs };
}
