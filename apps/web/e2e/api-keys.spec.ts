import { expect, test } from "@playwright/test";

test("admin creates an API key, uses it, and revokes it", async ({ page, request }) => {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("admin@msbsparkle.local");
  await page.getByLabel("Password").fill("admin12345!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/admin$/);

  await page.getByRole("link", { name: "API keys" }).click();
  await expect(page.getByRole("heading", { name: "API keys" })).toBeVisible();
  const name = `e2e ${Date.now()}`;
  await page.getByLabel("Key name").fill(name);
  await page.getByTestId("api-key-create").click();
  const key = (await page.getByTestId("api-key-value").textContent())!.trim();
  expect(key).toMatch(/^sk_/);
  await page.getByRole("button", { name: "I've saved it" }).click();
  const row = page.getByTestId("api-keys").getByRole("row").filter({ hasText: name });
  await expect(row).toContainText(key.slice(0, 10));

  const auth = { authorization: `Bearer ${key}` };
  const me = await request.get("/api/v1/me", { headers: auth });
  expect(me.status()).toBe(200);
  expect((await me.json()).data.key.name).toBe(name);
  const list = await request.get("/api/v1/bookings?limit=2", { headers: auth });
  expect(list.status()).toBe(200);
  expect(Array.isArray((await list.json()).data)).toBe(true);
  expect((await request.get("/api/v1/bookings")).status()).toBe(401);

  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "Revoke" }).click();
  await expect(row).toContainText("Revoked");
  expect((await request.get("/api/v1/me", { headers: auth })).status()).toBe(401);
});
