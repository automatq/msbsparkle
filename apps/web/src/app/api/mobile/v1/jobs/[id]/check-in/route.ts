import { positionBody } from "@msb/shared/mobile-api";
import { checkIn } from "@/modules/cleaner/service";
import { cleanerRoute, fromResult, parseJson } from "@/modules/mobile-api/http";

export const runtime = "nodejs";

/** Geofence warnings come back in `warnings`; they never block the check-in. */
export const POST = cleanerRoute<{ id: string }>(async ({ req, actor, params }) => {
  const body = await parseJson(req, positionBody);
  if ("response" in body) return body.response;
  return fromResult(await checkIn(actor, params.id, body.data.position));
});
