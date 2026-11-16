/**
 * HTTP client for /api/mobile/v1. Pure TypeScript with injected storage and fetch, so it can be
 * unit-tested without React Native.
 *
 * - Adds the bearer token; on 401 UNAUTHORIZED refreshes once and retries.
 * - Refreshes are single-flight: refresh tokens are single-use and replaying one ends the
 *   session server-side, so concurrent 401s must share one refresh.
 * - SESSION_ENDED (or a failed refresh) clears the tokens and tells the app to sign in again.
 */
import {
  MOBILE_API_BASE,
  type ApiError,
  type ApiErrorCode,
  type ApiResponse,
  type TokenPair,
} from "@msb/shared/mobile-api";

export interface TokenStore {
  get(): Promise<TokenPair | null>;
  set(tokens: TokenPair | null): Promise<void>;
}

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly issues?: ApiError["issues"],
  ) {
    super(message);
  }
}

export type ApiResult<T> = { data: T; message?: string; warnings?: string[] };

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  form?: FormData;
  /** For the sign-in endpoints: no bearer token, no refresh. */
  anonymous?: boolean;
  signal?: AbortSignal;
};

export function createApiClient(deps: {
  baseUrl: string;
  store: TokenStore;
  fetch?: typeof fetch;
  onSessionEnded?: () => void;
}) {
  const doFetch = deps.fetch ?? fetch;
  const url = (path: string) => `${deps.baseUrl.replace(/\/$/, "")}${MOBILE_API_BASE}/${path}`;
  let refreshing: Promise<TokenPair | null> | null = null;

  async function endSession() {
    await deps.store.set(null);
    deps.onSessionEnded?.();
  }

  /** Exchanges the refresh token; concurrent callers share the same promise. */
  function refresh(): Promise<TokenPair | null> {
    refreshing ??= (async () => {
      try {
        const current = await deps.store.get();
        if (!current) return null;
        const res = await doFetch(url("auth/refresh"), {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ refreshToken: current.refreshToken }),
        });
        const body = (await res.json().catch(() => null)) as ApiResponse<TokenPair> | null;
        if (body?.ok) {
          await deps.store.set(body.data);
          return body.data;
        }
        // Network trouble or rate limiting: keep the tokens and let the caller retry later.
        if (res.status === 429 || res.status >= 500) return null;
        await endSession();
        return null;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  async function send(path: string, opts: RequestOptions, token: string | null) {
    const headers: Record<string, string> = { accept: "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;
    let body: BodyInit | undefined;
    if (opts.form) body = opts.form;
    else if (opts.body !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(opts.body);
    }
    return doFetch(url(path), {
      method: opts.method ?? (body ? "POST" : "GET"),
      headers,
      body,
      signal: opts.signal,
    });
  }

  async function request<T>(path: string, opts: RequestOptions = {}): Promise<ApiResult<T>> {
    let tokens = opts.anonymous ? null : await deps.store.get();
    if (!opts.anonymous && !tokens) {
      await endSession();
      throw new ApiRequestError(401, "SESSION_ENDED", "Sign in again.");
    }
    let res = await send(path, opts, tokens?.accessToken ?? null);
    if (res.status === 401 && !opts.anonymous) {
      const peek = (await res
        .clone()
        .json()
        .catch(() => null)) as ApiResponse<T> | null;
      if (peek && !peek.ok && peek.error.code === "UNAUTHORIZED") {
        const fresh = await refresh();
        if (!fresh) {
          // Tokens still stored means the refresh failed for a passing reason (offline, 5xx).
          if (await deps.store.get())
            throw new ApiRequestError(503, "INTERNAL", "Can't reach the server. Try again.");
          throw new ApiRequestError(401, "SESSION_ENDED", "Sign in again.");
        }
        res = await send(path, opts, fresh.accessToken);
      }
    }
    const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;
    if (!json) throw new ApiRequestError(res.status, "INTERNAL", "Unexpected server response.");
    if (json.ok) return { data: json.data, message: json.message, warnings: json.warnings };
    if (json.error.code === "SESSION_ENDED" || (res.status === 401 && !opts.anonymous))
      await endSession();
    throw new ApiRequestError(res.status, json.error.code, json.error.message, json.error.issues);
  }

  /** True while tokens are stored (signed in, possibly needing a refresh). */
  const hasSession = async () => !!(await deps.store.get());

  return { request, refresh, endSession, hasSession };
}

export type ApiClient = ReturnType<typeof createApiClient>;
