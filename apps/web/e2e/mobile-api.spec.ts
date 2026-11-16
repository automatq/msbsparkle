import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * The mobile app's sign-in against the real server: OTP by phone (code arrives by email in dev),
 * token pair, authenticated calls, refresh rotation, replay detection and logout.
 * Uses Priya (seeded, 416 555 1002) so it never races the web cleaner spec, which uses Amara.
 */
const MAILPIT = "http://localhost:8025";
const API = "/api/mobile/v1";
const PHONE = "416 555 1002";
const EMAIL = "priya.nair@cleaners.msbsparkle.local";

async function latestOtp(request: APIRequestContext, after: number): Promise<string> {
  let code = "";
  await expect
    .poll(
      async () => {
        const res = await request.get(
          `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${EMAIL} subject:"sign-in code"`)}`,
        );
        const body = (await res.json()) as { messages?: { Subject: string; Created: string }[] };
        const fresh = body.messages?.find((m) => Date.parse(m.Created) >= after);
        code = fresh?.Subject.match(/(\d{6})/)?.[1] ?? "";
        return code;
      },
      { timeout: 15_000 },
    )
    .toMatch(/^\d{6}$/);
  return code;
}

type Tokens = { accessToken: string; refreshToken: string };

test("mobile API: OTP sign-in, authenticated calls, refresh rotation, replay, logout", async ({
  request,
}) => {
  const asked = Date.now() - 1000;
  const sent = await request.post(`${API}/auth/otp/request`, { data: { phone: PHONE } });
  expect(sent.status()).toBe(200);
  expect(await sent.json()).toMatchObject({ ok: true, data: { channel: "email" } });

  const code = await latestOtp(request, asked);
  const verified = await request.post(`${API}/auth/otp/verify`, {
    data: { phone: PHONE, code, device: { name: "E2E phone", platform: "android" } },
  });
  expect(verified.status()).toBe(200);
  const first = ((await verified.json()) as { data: Tokens }).data;
  expect(first.accessToken).toMatch(/^msb_at_/);

  const auth = (t: string) => ({ authorization: `Bearer ${t}` });
  const me = await request.get(`${API}/me`, { headers: auth(first.accessToken) });
  expect(await me.json()).toMatchObject({ ok: true, data: { firstName: "Priya" } });
  const jobs = await request.get(`${API}/jobs`, { headers: auth(first.accessToken) });
  expect(jobs.status()).toBe(200);
  expect(await jobs.json()).toMatchObject({ ok: true, data: { jobs: expect.any(Array) } });
  expect(
    (
      await request.get(`${API}/jobs/does-not-exist`, { headers: auth(first.accessToken) })
    ).status(),
  ).toBe(404);
  expect((await request.get(`${API}/jobs`)).status()).toBe(401);

  // Refresh rotates the pair; the old access token stops working.
  const refreshed = await request.post(`${API}/auth/refresh`, {
    data: { refreshToken: first.refreshToken },
  });
  const second = ((await refreshed.json()) as { data: Tokens }).data;
  expect(second.refreshToken).not.toBe(first.refreshToken);
  expect((await request.get(`${API}/me`, { headers: auth(first.accessToken) })).status()).toBe(401);
  expect((await request.get(`${API}/me`, { headers: auth(second.accessToken) })).status()).toBe(
    200,
  );

  // Replaying the old refresh token ends the session for everyone holding it.
  const replay = await request.post(`${API}/auth/refresh`, {
    data: { refreshToken: first.refreshToken },
  });
  expect(replay.status()).toBe(401);
  expect(await replay.json()).toMatchObject({ ok: false, error: { code: "SESSION_ENDED" } });
  expect((await request.get(`${API}/me`, { headers: auth(second.accessToken) })).status()).toBe(
    401,
  );

  // A fresh sign-in, then logout.
  const asked2 = Date.now() - 1000;
  await request.post(`${API}/auth/otp/request`, { data: { phone: PHONE } });
  const code2 = await latestOtp(request, asked2);
  const third = (
    (await (
      await request.post(`${API}/auth/otp/verify`, { data: { phone: PHONE, code: code2 } })
    ).json()) as { data: Tokens }
  ).data;
  expect(
    (await request.post(`${API}/auth/logout`, { headers: auth(third.accessToken) })).status(),
  ).toBe(200);
  expect((await request.get(`${API}/me`, { headers: auth(third.accessToken) })).status()).toBe(401);
});
