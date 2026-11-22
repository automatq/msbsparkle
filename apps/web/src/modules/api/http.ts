/**
 * Plumbing for the read-only REST API (/api/v1): bearer-key auth, per-key rate limit, the JSON
 * envelope, query parsing and cursor pagination.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/modules/shared/rate-limit";
import { authenticateApiKey, type ApiAuth } from "./keys";

export const RATE_LIMIT_PER_MINUTE = 300;

type ErrorCode = "unauthorized" | "not_found" | "invalid_request" | "rate_limited" | "internal";
const STATUS: Record<ErrorCode, number> = {
  unauthorized: 401,
  not_found: 404,
  invalid_request: 400,
  rate_limited: 429,
  internal: 500,
};

const BASE_HEADERS = { "cache-control": "no-store" };

export function apiError(
  code: ErrorCode,
  message: string,
  headers: Record<string, string> = {},
): NextResponse {
  return NextResponse.json(
    { error: { code, message } },
    { status: STATUS[code], headers: { ...BASE_HEADERS, ...headers } },
  );
}

export class ApiNotFound extends Error {}
export class ApiInvalid extends Error {}

type Handler<P> = (args: {
  req: Request;
  params: P;
  auth: ApiAuth;
  query: URLSearchParams;
}) => Promise<unknown>;

/**
 * Wraps a GET handler: authenticates the key, applies the per-key limit, and returns whatever the
 * handler returns as JSON. Throw ApiNotFound / ApiInvalid (or a ZodError) for 404 / 400.
 */
export function apiRoute<P = Record<string, never>>(handler: Handler<P>) {
  return async (req: Request, context: { params: Promise<P> }): Promise<Response> => {
    try {
      const auth = await authenticateApiKey(req.headers.get("authorization"));
      if (!auth)
        return apiError(
          "unauthorized",
          "Missing or invalid API key. Send it as: Authorization: Bearer sk_…",
          { "www-authenticate": 'Bearer realm="api"' },
        );
      const limit = await rateLimit("api", auth.keyId, RATE_LIMIT_PER_MINUTE, 60);
      const limitHeaders = {
        "x-ratelimit-limit": String(RATE_LIMIT_PER_MINUTE),
        "x-ratelimit-remaining": String(limit.remaining),
      };
      if (!limit.allowed)
        return apiError("rate_limited", "Too many requests.", {
          ...limitHeaders,
          "retry-after": String(limit.retryAfterSeconds),
        });
      const body = await handler({
        req,
        params: await context.params,
        auth,
        query: new URL(req.url).searchParams,
      });
      return NextResponse.json(body, { headers: { ...BASE_HEADERS, ...limitHeaders } });
    } catch (e) {
      if (e instanceof ApiNotFound) return apiError("not_found", e.message || "Not found.");
      if (e instanceof ApiInvalid) return apiError("invalid_request", e.message);
      if (e instanceof z.ZodError) {
        const i = e.issues[0];
        return apiError(
          "invalid_request",
          i ? `${i.path.join(".") || "query"}: ${i.message}` : "Invalid request.",
        );
      }
      console.error("[api/v1]", new URL(req.url).pathname, e);
      return apiError("internal", "Something went wrong.");
    }
  };
}

/** Query params as a plain object for zod, ignoring repeats. */
export function queryObject(q: URLSearchParams): Record<string, string> {
  return Object.fromEntries(q.entries());
}

export const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(64).optional(),
});

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");
export const isoDateTime = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), "use an ISO 8601 timestamp");

/**
 * Cursor pagination over rows with unique ids: fetch one extra row to know whether there's a
 * next page. `cursor` is the last id of the previous page.
 */
export function page<T extends { id: string }, U>(rows: T[], limit: number, map: (r: T) => U) {
  const more = rows.length > limit;
  const items = more ? rows.slice(0, limit) : rows;
  return { data: items.map(map), nextCursor: more ? items[items.length - 1].id : null };
}

export function cursorArgs(cursor: string | undefined, limit: number) {
  return { take: limit + 1, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) };
}
