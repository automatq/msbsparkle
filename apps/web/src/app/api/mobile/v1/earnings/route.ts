import { getEarnings } from "@/modules/cleaner/service";
import { toEarnings } from "@/modules/mobile-api/dto";
import { apiOk, cleanerRoute } from "@/modules/mobile-api/http";

export const runtime = "nodejs";

export const GET = cleanerRoute(async ({ actor }) => apiOk(toEarnings(await getEarnings(actor))));
