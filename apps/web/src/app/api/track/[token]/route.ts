import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/modules/shared/rate-limit";
import { getTrackingView } from "@/modules/tracking/service";

export const runtime = "nodejs";

/** Public, polled by the customer's tracking page. The token is the only credential. */
export async function GET(_req: Request, ctx: RouteContext<"/api/track/[token]">) {
  const rl = await rateLimit("track", await clientIp(), 120, 60);
  if (!rl.allowed)
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSeconds) } },
    );
  const { token } = await ctx.params;
  const view = await getTrackingView(token);
  if (!view) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(view, {
    headers: { "cache-control": "no-store", "x-robots-tag": "noindex" },
  });
}
