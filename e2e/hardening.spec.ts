import { expect, test, type Page } from "@playwright/test";
import { generateSync } from "otplib";
import { Client } from "pg";

const DB =
  process.env.DATABASE_URL ?? "postgresql://sparkle:sparkle@localhost:5432/sparkle?schema=public";
async function resetAdminTotp() {
  const c = new Client({ connectionString: DB });
  await c.connect();
  await c.query(`update "User" set "totpEnabled"=false, "totpSecret"=null where email=$1`, [
    "admin@msbsparkle.local",
  ]);
  await c.end();
}

async function adminLogin(page: Page, totp?: string) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("admin@msbsparkle.local");
  await page.getByLabel("Password").fill("admin12345!");
  if (totp) await page.getByLabel(/Authenticator code/).fill(totp);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/admin$/);
}

async function bookTorontoJob(page: Page): Promise<string> {
  await page.goto("/book");
  await page.getByLabel("Postal code").fill("M4W 1A1");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByTestId("service-standard").click();
  await page.getByTestId("next").click();
  await page.getByTestId("next").click();
  await page.getByTestId("next").click();
  await page.getByTestId("frequency-ONE_TIME").click();
  await expect(page.getByTestId("quote-total")).toBeVisible();
  await page.getByTestId("next").click();
  await page.locator('[data-testid^="date-"]:not([disabled])').nth(4).click();
  await page.locator('[data-testid^="window-"]:not([disabled])').last().click();
  await page.getByTestId("next").click();
  await page.getByLabel("First name").fill("Auto");
  await page.getByLabel("Last name").fill("Dispatch");
  await page.getByLabel("Email", { exact: true }).fill(`auto-${Date.now()}@example.com`);
  await page.getByLabel("Phone").fill("4165550166");
  await page.getByLabel("Street address").fill("5 Bloor St W");
  await page.getByLabel("City").fill("Toronto");
  await page.getByLabel("Postal code").fill("M4W 1A1");
  await page.getByTestId("next").click();
  await page.getByRole("heading", { name: "Payment" }).waitFor();
  await page.getByTestId("next").click();
  await page.waitForURL(/\/book\/confirmation\//);
  return (await page.getByTestId("booking-number").textContent())!.trim();
}

test("job page ranks cleaners with reasons and one-click assign works", async ({ page }) => {
  const bookingNumber = await bookTorontoJob(page);
  await adminLogin(page);
  await page.goto(`/admin/jobs?from=2020-01-01&to=2030-01-01&q=${bookingNumber}`);
  await page.locator("table tbody tr td a").first().click();
  await page.waitForURL(/\/admin\/jobs\/[^/?]+$/);
  await expect(page.getByText("Suggested")).toBeVisible();
  const suggestions = page.locator('[data-testid^="suggest-"]');
  expect(await suggestions.count()).toBeGreaterThanOrEqual(3);
  await expect(suggestions.first()).toContainText(/available|free that day|served this customer/);
  await suggestions.first().getByRole("button", { name: "Assign" }).click();
  await expect(page.getByText("Done").first()).toBeVisible();
  await expect(page.locator("main").getByText("ASSIGNED", { exact: true }).first()).toBeVisible();
});

test("auto-assign fills unassigned jobs for a region day from the dispatch board", async ({
  page,
}) => {
  const bookingNumber = await bookTorontoJob(page);
  await adminLogin(page);
  await page.goto(`/admin/jobs?from=2020-01-01&to=2030-01-01&q=${bookingNumber}`);
  const when = (await page.locator("table tbody tr td a").first().textContent())!
    .trim()
    .split(" ")[0];
  await page.goto("/admin/regions");
  const regionId = (await page.getByRole("link", { name: "Toronto" }).getAttribute("href"))!
    .split("/")
    .pop();
  await page.goto(`/admin/calendar?region=${regionId}&date=${when}`);
  const button = page.getByRole("button", { name: /Auto-assign \d+/ });
  await expect(button).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await button.click();
  await expect(page.getByText(/Assigned \d+ job/)).toBeVisible();
  await expect(page.locator(".fc-event", { hasText: bookingNumber })).toBeVisible();
});

test("admin can enrol in two-factor, must use it at login, and can turn it off", async ({
  browser,
}) => {
  await resetAdminTotp();
  try {
    const ctx1 = await browser.newContext();
    const page = await ctx1.newPage();
    await adminLogin(page);
    await page.goto("/admin/settings/security");
    await page.getByTestId("totp-start").click();
    const secret = (await page.getByTestId("totp-secret").textContent())!.trim();
    expect(secret.length).toBeGreaterThan(10);
    await page.getByTestId("totp-code").fill(generateSync({ secret }));
    await page.getByTestId("totp-confirm").click();
    await expect(page.getByTestId("totp-on")).toBeVisible();
    await ctx1.close();

    // Fresh session: password alone must now fail, password + code must pass.
    const ctx2 = await browser.newContext();
    const p2 = await ctx2.newPage();
    await p2.goto("/admin/login");
    await p2.getByLabel("Email").fill("admin@msbsparkle.local");
    await p2.getByLabel("Password").fill("admin12345!");
    await p2.getByRole("button", { name: "Sign in" }).click();
    await expect(p2.getByText("Invalid email, password or code.")).toBeVisible();
    await adminLogin(p2, generateSync({ secret }));

    await p2.goto("/admin/settings/security");
    await p2.getByPlaceholder("Current code").fill(generateSync({ secret }));
    await p2.getByRole("button", { name: "Turn off" }).click();
    await expect(p2.getByTestId("totp-start")).toBeVisible();
    await ctx2.close();
  } finally {
    await resetAdminTotp();
  }
});

test("quote API is rate limited per client", async ({ request }) => {
  const body = {
    postalCode: "M5V 2T6",
    serviceSlug: "standard",
    bedrooms: 1,
    bathrooms: 1,
    extras: [],
    frequency: "ONE_TIME",
  };
  const ip = `203.0.113.${Math.floor(Math.random() * 250)}`;
  let limited = false;
  for (let i = 0; i < 65; i++) {
    const res = await request.post("/api/quote", {
      data: body,
      headers: { "x-forwarded-for": ip },
    });
    if (res.status() === 429) {
      limited = true;
      expect(res.headers()["retry-after"]).toBeTruthy();
      break;
    }
  }
  expect(limited).toBe(true);
});
