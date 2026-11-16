/**
 * Mobile API integration tests: token lifecycle and the cleaner endpoints, called as route
 * handlers against the local database. Skipped when DATABASE_URL is unset. The OTP endpoints
 * (which need request headers for IP limits) are covered end to end in e2e/mobile-api.spec.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ApiResponse, JobDetail, JobSummary } from "@msb/shared/mobile-api";
import {
  ACCESS_TTL_MS,
  createMobileSession,
  getMobileAuth,
  refreshMobileSession,
} from "@/modules/auth/mobile";
import { JPEG, cleanerFixtures } from "@/modules/cleaner/test-fixtures";
import { prisma } from "@/modules/db/client";
import * as availability from "./availability/route";
import * as earnings from "./earnings/route";
import * as logout from "./auth/logout/route";
import * as me from "./me/route";
import * as jobs from "./jobs/route";
import * as job from "./jobs/[id]/route";
import * as respond from "./jobs/[id]/respond/route";
import * as checkIn from "./jobs/[id]/check-in/route";
import * as checkOut from "./jobs/[id]/check-out/route";
import * as checklist from "./jobs/[id]/checklist/[itemId]/route";
import * as photos from "./jobs/[id]/photos/route";

const enabled = !!process.env.DATABASE_URL;
const fx = cleanerFixtures(`api${Date.now().toString(36)}`, 7500);
const device = { name: "Test phone", platform: "android" as const };

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- route params differ per handler
type Handler = (req: Request, ctx: { params: Promise<any> }) => Promise<Response>;

async function call<T>(
  handler: Handler,
  opts: {
    token?: string;
    method?: string;
    body?: unknown;
    form?: FormData;
    params?: Record<string, string>;
    query?: string;
  } = {},
): Promise<{ status: number; body: ApiResponse<T> }> {
  const headers: Record<string, string> = {};
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const req = new Request(`http://localhost/api/mobile/v1/test${opts.query ?? ""}`, {
    method: opts.method ?? (opts.body !== undefined || opts.form ? "POST" : "GET"),
    headers,
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });
  const res = await handler(req, { params: Promise.resolve(opts.params ?? {}) });
  return { status: res.status, body: (await res.json()) as ApiResponse<T> };
}

const bearer = (token: string) => ({ headers: new Headers({ authorization: `Bearer ${token}` }) });

async function signIn(cleanerUserId: string) {
  return createMobileSession(cleanerUserId, device);
}

describe.skipIf(!enabled)("mobile API (integration)", () => {
  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;
  });
  afterAll(fx.cleanup);

  describe("tokens", () => {
    it("access tokens work until they expire", async () => {
      const c = await fx.makeCleaner();
      const t = await signIn(c.userId!);
      expect((await getMobileAuth(bearer(t.accessToken)))?.ctx.userId).toBe(c.userId);
      const later = new Date(Date.now() + ACCESS_TTL_MS + 1000);
      expect(await getMobileAuth(bearer(t.accessToken), later)).toBeNull();
      expect(await getMobileAuth(bearer("msb_at_nope"))).toBeNull();
      expect(await getMobileAuth({ headers: new Headers() })).toBeNull();
    });

    it("refresh rotates both tokens; replaying the old refresh token ends the session", async () => {
      const c = await fx.makeCleaner();
      const first = await signIn(c.userId!);
      const second = await refreshMobileSession(first.refreshToken);
      expect(second.ok).toBe(true);
      if (!second.ok) return;
      expect(await getMobileAuth(bearer(first.accessToken))).toBeNull();
      expect(await getMobileAuth(bearer(second.tokens.accessToken))).not.toBeNull();

      // Someone replays the stolen first refresh token: the whole session dies.
      expect((await refreshMobileSession(first.refreshToken)).ok).toBe(false);
      expect(await getMobileAuth(bearer(second.tokens.accessToken))).toBeNull();
      expect((await refreshMobileSession(second.tokens.refreshToken)).ok).toBe(false);
    });

    it("bumping sessionVersion (suspension) ends every session", async () => {
      const c = await fx.makeCleaner();
      const t = await signIn(c.userId!);
      await prisma.user.update({
        where: { id: c.userId! },
        data: { sessionVersion: { increment: 1 } },
      });
      expect(await getMobileAuth(bearer(t.accessToken))).toBeNull();
      expect((await refreshMobileSession(t.refreshToken)).ok).toBe(false);
    });
  });

  describe("endpoints", () => {
    it("401 without a token, 403 for a suspended cleaner", async () => {
      expect((await call(jobs.GET)).status).toBe(401);
      const c = await fx.makeCleaner();
      const t = await signIn(c.userId!);
      await prisma.cleaner.update({ where: { id: c.id }, data: { status: "SUSPENDED" } });
      const r = await call(jobs.GET, { token: t.accessToken });
      expect(r.status).toBe(403);
      expect(r.body).toMatchObject({ ok: false, error: { code: "INACTIVE" } });
    });

    it("me and the job list; another cleaner's job is a 404", async () => {
      const c = await fx.makeCleaner();
      const other = await fx.makeCleaner();
      const t = await signIn(c.userId!);
      const { job: mine } = await fx.makeJob(c.id, "ACCEPTED");
      const { job: theirs } = await fx.makeJob(other.id, "ACCEPTED");

      const profile = await call<{ firstName: string; timezone: string }>(me.GET, {
        token: t.accessToken,
      });
      expect(profile.body).toMatchObject({ ok: true, data: { firstName: c.firstName } });

      const list = await call<{ jobs: JobSummary[] }>(jobs.GET, { token: t.accessToken });
      expect(list.status).toBe(200);
      const ids = list.body.ok ? list.body.data.jobs.map((j) => j.jobId) : [];
      expect(ids).toContain(mine.id);
      expect(ids).not.toContain(theirs.id);
      expect(JSON.stringify(list.body)).not.toMatch(/@example\.com/); // no customer emails

      expect(
        (await call(job.GET, { token: t.accessToken, params: { id: theirs.id } })).status,
      ).toBe(404);
      expect(
        (await call(jobs.GET, { token: t.accessToken, query: "?from=2026-01-01&to=2026-12-31" }))
          .status,
      ).toBe(400);
    });

    it("hides customer details and photos until the offer is accepted", async () => {
      const c = await fx.makeCleaner();
      const t = await signIn(c.userId!);
      const { job: offered } = await fx.makeJob(c.id, "OFFERED");
      const before = await call<JobDetail>(job.GET, {
        token: t.accessToken,
        params: { id: offered.id },
      });
      expect(before.body).toMatchObject({
        ok: true,
        data: { customer: null, can: { canRespond: true, canCheckIn: false } },
      });
      const accepted = await call(respond.POST, {
        token: t.accessToken,
        params: { id: offered.id },
        body: { accept: true },
      });
      expect(accepted.body).toMatchObject({ ok: true, message: "Job accepted" });
      const again = await call(respond.POST, {
        token: t.accessToken,
        params: { id: offered.id },
        body: { accept: true },
      });
      expect(again.status).toBe(409);
      const after = await call<JobDetail>(job.GET, {
        token: t.accessToken,
        params: { id: offered.id },
      });
      expect(after.body.ok && after.body.data.customer?.firstName).toBe("Svc");
    });

    it("runs a visit through the API and records the earning", async () => {
      const c = await fx.makeCleaner();
      const t = await signIn(c.userId!);
      const { job: j, itemId } = await fx.makeJob(c.id, "ACCEPTED");
      const token = t.accessToken;
      const params = { id: j.id };

      const early = await call(checklist.PUT, {
        token,
        method: "PUT",
        params: { id: j.id, itemId },
        body: { done: true },
      });
      expect(early.status).toBe(422);

      const ci = await call(checkIn.POST, {
        token,
        params,
        body: { position: { lat: 43.7, lng: -79.4 } },
      });
      expect(ci.status).toBe(200);
      expect(ci.body.ok && ci.body.warnings?.[0]).toMatch(/km from the address/);

      const bad = await call(checkIn.POST, { token, params, body: { position: { lat: 999 } } });
      expect(bad.status).toBe(400);

      expect(
        (
          await call(checklist.PUT, {
            token,
            method: "PUT",
            params: { id: j.id, itemId },
            body: { done: true },
          })
        ).status,
      ).toBe(200);

      const form = () => {
        const f = new FormData();
        f.set("kind", "AFTER");
        f.set("clientId", "client-photo-0001");
        f.set("file", new File([JPEG], "after.jpg", { type: "image/jpeg" }));
        return f;
      };
      const p1 = await call<{ id: string; url: string }>(photos.POST, {
        token,
        params,
        form: form(),
      });
      const p2 = await call<{ id: string; url: string }>(photos.POST, {
        token,
        params,
        form: form(),
      });
      expect(p1.status).toBe(200);
      expect(p1.body.ok && p2.body.ok && p1.body.data.id === p2.body.data.id).toBe(true);
      const noKind = new FormData();
      noKind.set("file", new File([JPEG], "x.jpg"));
      expect((await call(photos.POST, { token, params, form: noKind })).status).toBe(400);

      const co = await call<{ completed: boolean }>(checkOut.POST, { token, params, body: {} });
      expect(co.body).toMatchObject({ ok: true, data: { completed: true } });

      const pay = await call<{ items: { jobId: string; totalCents: number }[] }>(earnings.GET, {
        token,
      });
      expect(pay.body.ok && pay.body.data.items.find((i) => i.jobId === j.id)?.totalCents).toBe(
        5000,
      );
    });

    it("availability: validates, saves and reads back", async () => {
      const c = await fx.makeCleaner();
      const t = await signIn(c.userId!);
      const token = t.accessToken;
      const bad = await call(availability.PUT, {
        token,
        method: "PUT",
        body: { rows: [{ weekday: 1, startLocal: "17:00", endLocal: "09:00" }] },
      });
      expect(bad.status).toBe(400);
      const rows = [{ weekday: 1, startLocal: "09:00", endLocal: "17:00" }];
      expect((await call(availability.PUT, { token, method: "PUT", body: { rows } })).status).toBe(
        200,
      );
      const read = await call<{ rows: typeof rows }>(availability.GET, { token });
      expect(read.body).toMatchObject({ ok: true, data: { rows } });
    });

    it("logout ends the session", async () => {
      const c = await fx.makeCleaner();
      const t = await signIn(c.userId!);
      expect((await call(logout.POST, { token: t.accessToken, body: {} })).status).toBe(200);
      expect((await call(jobs.GET, { token: t.accessToken })).status).toBe(401);
    });
  });
});
