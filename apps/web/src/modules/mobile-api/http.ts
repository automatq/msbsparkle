/**
 * Plumbing shared by the `/api/mobile/v1` route handlers: the response envelope, error codes to
 * HTTP statuses, body parsing, and the bearer-auth + active-cleaner guard.
 */
import { NextResponse } from "next/server";
import type { z } from "zod";
import type { ApiErrorCode, ApiResponse } from "@msb/shared/mobile-api";
import { getMobileAuth, type MobileAuth } from "@/modules/auth/mobile";
import {
  resolveCleanerActor,
  type CleanerActor,
  type CleanerResult,
} from "@/modules/cleaner/service";

const STATUS: Record<ApiErrorCode, number> = {
  UNAUTHORIZED: 401,
  SESSION_ENDED: 401,
  INACTIVE: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PRECONDITION: 422,
  INVALID: 400,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

const NO_STORE = { "cache-control": "no-store" };

export function apiOk<T>(data: T, extra: { message?: string; warnings?: string[] } = {}) {
  const body: ApiResponse<T> = { ok: true, data, ...extra };
  return NextResponse.json(body, { headers: NO_STORE });
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  opts: { issues?: z.core.$ZodIssue[]; retryAfterSeconds?: number } = {},
) {
  const body: ApiResponse<never> = {
    ok: false,
    error: {
      code,
      message,
      ...(opts.issues
        ? {
            issues: opts.issues.map((i) => ({
              path: i.path.filter((p): p is string | number => typeof p !== "symbol"),
              message: i.message,
            })),
          }
        : {}),
    },
  };
  return NextResponse.json(body, {
    status: STATUS[code],
    headers: {
      ...NO_STORE,
      ...(opts.retryAfterSeconds ? { "retry-after": String(opts.retryAfterSeconds) } : {}),
    },
  });
}

/** Maps a cleaner-service result to the envelope, optionally reshaping the data. */
export function fromResult<T, U = T>(r: CleanerResult<T>, map?: (data: T) => U) {
  if (!r.ok) return apiError(r.code, r.message);
  const data = map ? map(r.data) : (r.data as unknown as U);
  return apiOk(data, { message: r.message, warnings: r.warnings });
}

/** Parses a JSON body; returns the data or a ready 400 response. */
export async function parseJson<S extends z.ZodType>(
  req: Request,
  schema: S,
): Promise<{ data: z.output<S> } | { response: NextResponse }> {
  const raw = await req.json().catch(() => undefined);
  const parsed = schema.safeParse(raw ?? {});
  if (!parsed.success)
    return {
      response: apiError("INVALID", parsed.error.issues[0]?.message ?? "Invalid request", {
        issues: parsed.error.issues,
      }),
    };
  return { data: parsed.data };
}

export function parseQuery<S extends z.ZodType>(
  req: Request,
  schema: S,
): { data: z.output<S> } | { response: NextResponse } {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const parsed = schema.safeParse(params);
  if (!parsed.success)
    return {
      response: apiError("INVALID", parsed.error.issues[0]?.message ?? "Invalid request", {
        issues: parsed.error.issues,
      }),
    };
  return { data: parsed.data };
}

type RouteArgs<P> = { req: Request; params: P; actor: CleanerActor; auth: MobileAuth };

/**
 * Wraps a handler that needs a signed-in, active cleaner. 401 without a valid access token (the
 * app refreshes and retries), 403 when the cleaner profile is suspended or inactive.
 */
export function cleanerRoute<P = Record<string, never>>(
  handler: (args: RouteArgs<P>) => Promise<Response>,
) {
  return async (req: Request, context: { params: Promise<P> }): Promise<Response> => {
    try {
      const auth = await getMobileAuth(req);
      if (!auth) return apiError("UNAUTHORIZED", "Sign in again.");
      const actor = await resolveCleanerActor(auth.ctx.userId);
      if (!actor)
        return apiError("INACTIVE", "Your cleaner account isn't active. Contact your dispatcher.");
      return await handler({ req, params: await context.params, actor, auth });
    } catch (e) {
      console.error("[mobile-api]", new URL(req.url).pathname, e);
      return apiError("INTERNAL", "Something went wrong. Try again.");
    }
  };
}

/** For the unauthenticated auth endpoints: same error handling, no session. */
export function publicRoute(handler: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    try {
      return await handler(req);
    } catch (e) {
      console.error("[mobile-api]", new URL(req.url).pathname, e);
      return apiError("INTERNAL", "Something went wrong. Try again.");
    }
  };
}
