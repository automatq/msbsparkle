import { createQuote } from "@/modules/pricing/quote-service";
import { quoteRequestSchema } from "@/modules/pricing/schemas";
import { withOrg } from "@/modules/shared/api/handlers";
import { fail, ok } from "@/modules/shared/api/response";
import { clientIp, rateLimit } from "@/modules/shared/rate-limit";

export function POST(req: Request) {
  return withOrg(req, async ({ organizationId }) => {
    const rl = await rateLimit("quote", `${organizationId}:${await clientIp()}`, 120, 60);
    if (!rl.allowed) return fail("RATE_LIMITED", 429);

    const parsed = quoteRequestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("INVALID", 400, parsed.error.issues);

    const result = await createQuote(organizationId, parsed.data);
    return result.ok ? ok(result.data) : fail(result.error.code, 422, result.error);
  });
}
