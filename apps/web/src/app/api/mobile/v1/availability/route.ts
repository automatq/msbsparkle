import { availabilityBody } from "@msb/shared/mobile-api";
import { getAvailability, saveAvailability } from "@/modules/cleaner/service";
import { toAvailability } from "@/modules/mobile-api/dto";
import { apiOk, cleanerRoute, fromResult, parseJson } from "@/modules/mobile-api/http";

export const runtime = "nodejs";

export const GET = cleanerRoute(async ({ actor }) =>
  apiOk(toAvailability(await getAvailability(actor))),
);

/** Replaces the weekly availability. Times are in the cleaner's home-region timezone. */
export const PUT = cleanerRoute(async ({ req, actor }) => {
  const body = await parseJson(req, availabilityBody);
  if ("response" in body) return body.response;
  return fromResult(await saveAvailability(actor, body.data.rows));
});
