import { getJobDetail } from "@/modules/cleaner/service";
import { toJobDetail } from "@/modules/mobile-api/dto";
import { apiError, apiOk, cleanerRoute } from "@/modules/mobile-api/http";

export const runtime = "nodejs";

export const GET = cleanerRoute<{ id: string }>(async ({ actor, params }) => {
  const detail = await getJobDetail(actor, params.id);
  if (!detail) return apiError("NOT_FOUND", "This job is not assigned to you.");
  return apiOk(toJobDetail(detail));
});
