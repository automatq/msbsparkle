import { z } from "zod";
import { findRegionByFsa, normalizePostal } from "@/modules/regions/lookup";
import { withOrg } from "@/modules/shared/api/handlers";
import { fail, ok } from "@/modules/shared/api/response";

const schema = z.object({ postalCode: z.string().min(3).max(7) });

export function POST(req: Request) {
  return withOrg(req, async ({ organizationId }) => {
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("INVALID", 400, parsed.error.issues);

    const postal = normalizePostal(parsed.data.postalCode);
    if (!postal) return fail("INVALID_POSTAL", 422);
    const region = await findRegionByFsa(organizationId, postal.fsa);
    if (!region) return fail("OUT_OF_AREA", 422, { fsa: postal.fsa });
    return ok({
      region: {
        id: region.id,
        slug: region.slug,
        name: region.name,
        province: region.province,
        timezone: region.timezone,
        phone: region.phone,
      },
      fsa: postal.fsa,
      postalCode: postal.postalCode,
    });
  });
}
