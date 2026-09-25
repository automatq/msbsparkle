import { NextResponse } from "next/server";
import { quoteRequestSchema } from "@/modules/pricing/schemas";
import { createQuote } from "@/modules/pricing/quote-service";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = quoteRequestSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { ok: false, error: { code: "INVALID", issues: parsed.error.issues } },
      { status: 400 },
    );
  const result = await createQuote(parsed.data);
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
