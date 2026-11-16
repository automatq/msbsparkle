import { describe, expect, it, vi } from "vitest";
import type { TokenPair } from "@msb/shared/mobile-api";
import { ApiRequestError, createApiClient, type TokenStore } from "./client";

const pair = (n: number): TokenPair => ({
  accessToken: `msb_at_${n}`,
  refreshToken: `msb_rt_${n}`,
  accessExpiresAt: new Date().toISOString(),
  refreshExpiresAt: new Date().toISOString(),
});

function memoryStore(initial: TokenPair | null): TokenStore & { value: TokenPair | null } {
  return {
    value: initial,
    async get() {
      return this.value;
    },
    async set(t) {
      this.value = t;
    },
  };
}

const json = (status: number, body: unknown) => Response.json(body, { status });
const unauthorized = () => json(401, { ok: false, error: { code: "UNAUTHORIZED", message: "x" } });

/** A fake server: access token n is valid only for the latest n; refresh rotates. */
function fakeServer(opts: { refreshStatus?: number } = {}) {
  let current = 1;
  let refreshCalls = 0;
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/auth/refresh")) {
      refreshCalls++;
      await new Promise((r) => setTimeout(r, 5));
      if (opts.refreshStatus)
        return json(opts.refreshStatus, {
          ok: false,
          error: { code: opts.refreshStatus === 401 ? "SESSION_ENDED" : "INTERNAL", message: "x" },
        });
      const sent = JSON.parse(String(init?.body)).refreshToken;
      if (sent !== `msb_rt_${current}`)
        return json(401, { ok: false, error: { code: "SESSION_ENDED", message: "reused" } });
      current++;
      return json(200, { ok: true, data: pair(current) });
    }
    const auth = new Headers(init?.headers).get("authorization");
    if (auth !== `Bearer msb_at_${current}`) return unauthorized();
    return json(200, { ok: true, data: { url } });
  });
  return { fetchImpl, refreshCalls: () => refreshCalls, rotate: () => current++ };
}

describe("mobile api client", () => {
  it("sends the bearer token", async () => {
    const server = fakeServer();
    const api = createApiClient({
      baseUrl: "https://x.test/",
      store: memoryStore(pair(1)),
      fetch: server.fetchImpl,
    });
    const r = await api.request<{ url: string }>("me");
    expect(r.data.url).toBe("https://x.test/api/mobile/v1/me");
  });

  it("refreshes once for concurrent 401s and retries each request", async () => {
    const server = fakeServer();
    server.rotate(); // the stored access token is now stale; refresh token 1 is also stale...
    const store = memoryStore({ ...pair(1), refreshToken: "msb_rt_2" });
    const api = createApiClient({ baseUrl: "https://x.test", store, fetch: server.fetchImpl });
    const results = await Promise.all([
      api.request("me"),
      api.request("jobs"),
      api.request("earnings"),
    ]);
    expect(results).toHaveLength(3);
    expect(server.refreshCalls()).toBe(1);
    expect(store.value?.accessToken).toBe("msb_at_3");
  });

  it("signs out when the server ends the session", async () => {
    const server = fakeServer({ refreshStatus: 401 });
    server.rotate();
    const store = memoryStore(pair(1));
    const onSessionEnded = vi.fn();
    const api = createApiClient({
      baseUrl: "https://x.test",
      store,
      fetch: server.fetchImpl,
      onSessionEnded,
    });
    await expect(api.request("me")).rejects.toMatchObject({ code: "SESSION_ENDED" });
    expect(store.value).toBeNull();
    expect(onSessionEnded).toHaveBeenCalled();
  });

  it("keeps the session when the refresh fails for a passing reason", async () => {
    const server = fakeServer({ refreshStatus: 503 });
    server.rotate();
    const store = memoryStore(pair(1));
    const api = createApiClient({ baseUrl: "https://x.test", store, fetch: server.fetchImpl });
    await expect(api.request("me")).rejects.toBeInstanceOf(ApiRequestError);
    expect(store.value).not.toBeNull();
  });

  it("surfaces API errors with their code", async () => {
    const fetchImpl = vi.fn(async () =>
      json(409, { ok: false, error: { code: "CONFLICT", message: "Already checked in." } }),
    );
    const api = createApiClient({
      baseUrl: "https://x.test",
      store: memoryStore(pair(1)),
      fetch: fetchImpl,
    });
    await expect(api.request("jobs/1/check-in", { body: {} })).rejects.toMatchObject({
      status: 409,
      code: "CONFLICT",
      message: "Already checked in.",
    });
  });
});
