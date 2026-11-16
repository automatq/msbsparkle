import { timeOffBody } from "@msb/shared/mobile-api";
import { requestTimeOff } from "@/modules/cleaner/service";
import { cleanerRoute, fromResult, parseJson } from "@/modules/mobile-api/http";

export const runtime = "nodejs";

export const POST = cleanerRoute(async ({ req, actor }) => {
  const body = await parseJson(req, timeOffBody);
  if ("response" in body) return body.response;
  return fromResult(await requestTimeOff(actor, body.data));
});
