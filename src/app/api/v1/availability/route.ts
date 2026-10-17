import { z } from "zod";
import { prisma } from "@/modules/db/client";
import { loadAvailability } from "@/modules/scheduling/availability";
import { withOrg } from "@/modules/shared/api/handlers";
import { fail, ok } from "@/modules/shared/api/response";
import { addLocalDays, todayIn } from "@/modules/shared/dates";

const schema = z.object({
  regionId: z.string().min(1),
  days: z.number().int().min(1).max(60).default(21),
});

export function POST(req: Request) {
  return withOrg(req, async ({ organizationId }) => {
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("INVALID", 400, parsed.error.issues);

    const region = await prisma.region.findUnique({
      where: { id: parsed.data.regionId },
      select: { organizationId: true, timezone: true },
    });
    if (!region || region.organizationId !== organizationId) return fail("NOT_FOUND", 404);

    const from = todayIn(region.timezone);
    const to = addLocalDays(from, parsed.data.days);
    const days = await loadAvailability(parsed.data.regionId, from, to);
    return ok({ from, days });
  });
}
