import { locationBody } from "@msb/shared/mobile-api";
import { prisma } from "@/modules/db/client";
import { apiError, apiOk, cleanerRoute, parseJson } from "@/modules/mobile-api/http";
import { rateLimit } from "@/modules/shared/rate-limit";
import { recordLocations } from "@/modules/tracking/service";

export const runtime = "nodejs";

/**
 * Background location between "On my way" and check-in. Answers `tracking: false` when the job
 * is no longer on the way (checked in, cancelled, reassigned): the app should stop sending.
 */
export const POST = cleanerRoute<{ id: string }>(async ({ req, actor, params }) => {
  const body = await parseJson(req, locationBody);
  if ("response" in body) return body.response;
  const a = await prisma.assignment.findUnique({
    where: { jobId_cleanerId: { jobId: params.id, cleanerId: actor.cleanerId } },
    select: { id: true, job: { select: { organizationId: true } } },
  });
  if (!a || a.job.organizationId !== actor.orgId)
    return apiError("NOT_FOUND", "This job is not assigned to you.");
  const rl = await rateLimit("mobile:location", a.id, 30, 60);
  if (!rl.allowed)
    return apiError("RATE_LIMITED", "Send locations less often.", {
      retryAfterSeconds: rl.retryAfterSeconds,
    });
  return apiOk(await recordLocations(a.id, body.data.pings));
});
