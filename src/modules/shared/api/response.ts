import { NextResponse } from "next/server";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}

export function fail(
  code: string,
  status: number,
  issues?: unknown,
): NextResponse<{ ok: false; error: { code: string; issues?: unknown } }> {
  return NextResponse.json({ ok: false, error: { code, issues } }, { status });
}

/** Maps a `{ ok, message }` server-action result onto the API response shape. */
export function fromAction(
  r: { ok: true; message?: string; warnings?: string[] } | { ok: false; message: string },
) {
  return r.ok
    ? ok({ message: r.message ?? null, warnings: r.warnings ?? [] })
    : fail("ACTION_FAILED", 422, { message: r.message });
}

export async function jsonBody(req: Request): Promise<unknown> {
  return req.json().catch(() => null);
}
