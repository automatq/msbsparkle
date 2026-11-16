import { prisma } from "@/modules/db/client";
import { toMe } from "@/modules/mobile-api/dto";
import { apiOk, cleanerRoute } from "@/modules/mobile-api/http";
import { currency, locale } from "@/modules/shared/country";

export const runtime = "nodejs";

export const GET = cleanerRoute(async ({ actor }) => {
  const cleaner = await prisma.cleaner.findUniqueOrThrow({
    where: { id: actor.cleanerId },
    include: { homeRegion: { select: { name: true, timezone: true } } },
  });
  return apiOk(toMe(cleaner, { currency, locale }));
});
