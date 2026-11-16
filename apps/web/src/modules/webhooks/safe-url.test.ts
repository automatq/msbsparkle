import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postWebhook } from "./deliver";
import { isBlockedAddress, validateWebhookUrl } from "./safe-url";

// Strict by default, even where the environment (CI) enables private targets for e2e.
beforeEach(() => {
  vi.stubEnv("WEBHOOKS_ALLOW_PRIVATE", "");
  vi.stubEnv("VERCEL_ENV", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("isBlockedAddress", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.20.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "::",
    "fd00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "64:ff9b::a9fe:a9fe",
    "not-an-ip",
  ])("blocks %s", (ip) => expect(isBlockedAddress(ip)).toBe(true));

  it.each(["8.8.8.8", "93.184.216.34", "2606:4700:4700::1111", "::ffff:8.8.8.8"])(
    "allows %s",
    (ip) => expect(isBlockedAddress(ip)).toBe(false),
  );
});

describe("validateWebhookUrl", () => {
  it("accepts public https URLs", () => {
    expect(validateWebhookUrl(" https://hooks.example.com/x?y=1 ")).toBe(
      "https://hooks.example.com/x?y=1",
    );
  });

  it.each([
    ["http://hooks.example.com", /https/],
    ["ftp://example.com", /https/],
    ["https://user:pw@example.com", /username/],
    ["https://localhost/hook", /public hostname/],
    ["https://intranet/hook", /public hostname/],
    ["https://127.0.0.1/hook", /private/],
    ["https://[::1]/hook", /private/],
    ["https://169.254.169.254/latest", /private/],
    ["https://example.com/#frag", /fragment/],
    ["example.com", /full URL/],
  ])("rejects %s", (url, msg) => expect(() => validateWebhookUrl(url)).toThrow(msg));

  it("allows local targets only with WEBHOOKS_ALLOW_PRIVATE outside production", () => {
    vi.stubEnv("WEBHOOKS_ALLOW_PRIVATE", "1");
    expect(validateWebhookUrl("http://localhost:4000/h")).toBe("http://localhost:4000/h");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(() => validateWebhookUrl("http://localhost:4000/h")).toThrow();
  });
});

describe("postWebhook", () => {
  async function server(handler: http.RequestListener) {
    const s = http.createServer(handler);
    await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
    return { s, url: `http://127.0.0.1:${(s.address() as AddressInfo).port}` };
  }

  it("refuses private addresses, even by hostname, unless allowed", async () => {
    const hit = vi.fn();
    const { s, url } = await server((_, res) => (hit(), res.end("ok")));
    try {
      expect(await postWebhook(url, "{}", {})).toMatchObject({ ok: false });
      vi.stubEnv("WEBHOOKS_ALLOW_PRIVATE", "1");
      vi.stubEnv("VERCEL_ENV", "production");
      // https + a hostname that resolves to loopback: refused at connect time.
      const r = await postWebhook(url.replace("http://127.0.0.1", "https://localhost"), "{}", {});
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/private/);
      expect(hit).not.toHaveBeenCalled();
    } finally {
      s.close();
    }
  });

  it("posts the body, treats 2xx as success and does not follow redirects", async () => {
    vi.stubEnv("WEBHOOKS_ALLOW_PRIVATE", "1");
    const seen: string[] = [];
    const { s, url } = await server((req, res) => {
      let b = "";
      req.on("data", (c) => (b += c));
      req.on("end", () => {
        seen.push(`${req.method} ${req.url} ${req.headers["webhook-id"]} ${b}`);
        if (req.url === "/moved") {
          res.writeHead(301, { location: "/ok" });
          return res.end();
        }
        res.writeHead(req.url === "/ok" ? 204 : 500);
        res.end(req.url === "/ok" ? undefined : "boom");
      });
    });
    try {
      expect(await postWebhook(`${url}/ok`, '{"a":1}', { "webhook-id": "m1" })).toEqual({
        ok: true,
        status: 204,
        error: null,
      });
      expect(await postWebhook(`${url}/fail`, "{}", {})).toMatchObject({
        ok: false,
        status: 500,
        error: "HTTP 500: boom",
      });
      expect(await postWebhook(`${url}/moved`, "{}", {})).toMatchObject({
        ok: false,
        status: 301,
      });
      expect(seen).toEqual([
        'POST /ok m1 {"a":1}',
        "POST /fail undefined {}",
        "POST /moved undefined {}",
      ]);
    } finally {
      s.close();
    }
  });

  it("times out slow endpoints", async () => {
    vi.stubEnv("WEBHOOKS_ALLOW_PRIVATE", "1");
    const { s, url } = await server(() => {});
    try {
      const r = await postWebhook(url, "{}", {}, 200);
      expect(r).toMatchObject({ ok: false, status: null });
      expect(r.error).toMatch(/No response/);
    } finally {
      s.closeAllConnections();
      s.close();
    }
  });
});
