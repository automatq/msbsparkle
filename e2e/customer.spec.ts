import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const MAILPIT = "http://localhost:8025";

async function bookTorontoJob(page: Page, email: string): Promise<string> {
  await page.goto("/book");
  await page.getByLabel("Postal code").fill("M4W 1A1");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByTestId("service-standard").click();
  await page.getByTestId("next").click();
  await page.getByTestId("next").click();
  await page.getByTestId("next").click();
  await page.getByTestId("frequency-BIWEEKLY").click();
  await expect(page.getByTestId("quote-total")).toBeVisible();
  await page.getByTestId("next").click();
  await page.locator('[data-testid^="date-"]:not([disabled])').nth(1).click();
  await page.locator('[data-testid^="window-"]:not([disabled])').first().click();
  await page.getByTestId("next").click();
  await page.getByLabel("First name").fill("Portal");
  await page.getByLabel("Last name").fill("Customer");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Phone").fill("4165550188");
  await page.getByLabel("Street address").fill("3 Bloor St W");
  await page.getByLabel("City").fill("Toronto");
  await page.getByLabel("Postal code").fill("M4W 1A1");
  await page.getByTestId("next").click();
  await page.getByRole("heading", { name: "Payment" }).waitFor();
  await page.getByTestId("next").click();
  await page.waitForURL(/\/book\/confirmation\//);
  return (await page.getByTestId("booking-number").textContent())!.trim();
}

async function magicLink(request: APIRequestContext, email: string): Promise<string> {
  let link = "";
  await expect
    .poll(
      async () => {
        const res = await request.get(
          `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email} subject:"Sign in"`)}`,
        );
        const body = (await res.json()) as { messages?: { ID: string }[] };
        const id = body.messages?.[0]?.ID;
        if (!id) return "";
        const msg = (await (await request.get(`${MAILPIT}/api/v1/message/${id}`)).json()) as {
          Text: string;
          HTML: string;
        };
        const m = (msg.Text + msg.HTML).match(
          /https?:\/\/localhost:3000\/api\/auth\/callback\/nodemailer[^\s"<]+/,
        );
        link = m?.[0]?.replace(/&amp;/g, "&") ?? "";
        return link;
      },
      { timeout: 15_000 },
    )
    .toContain("/api/auth/callback/");
  return link;
}

test("customer: magic-link login, reschedule a visit, skip one, pause series, rate a completed visit", async ({
  page,
  request,
}) => {
  const email = `portal-${Date.now()}@example.com`;
  const bookingNumber = await bookTorontoJob(page, email);

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await page.goto(await magicLink(request, email));
  await expect(page).toHaveURL(/\/account/);
  await expect(page.getByRole("heading", { name: /Hi Portal/ })).toBeVisible();
  await expect(page.getByText(bookingNumber).first()).toBeVisible();
  await expect(page.getByText("Every 2 weeks")).toBeVisible();

  // Reschedule the first upcoming visit to a different open day.
  const first = page.locator('[data-testid^="visit-"]').first();
  await first.getByTestId("reschedule-open").click();
  const days = first.locator('[data-testid^="rs-date-"]');
  await expect(days.first()).toBeVisible();
  await days.nth(3).click();
  await first.locator('[data-testid^="rs-window-"]:not([disabled])').last().click();
  await first.getByTestId("reschedule-confirm").click();
  await expect(page.getByText("Visit rescheduled")).toBeVisible();

  // Skip the second visit (recurring, outside 24h => no fee).
  const before = await page.locator('[data-testid^="visit-"]').count();
  page.once("dialog", (d) => d.accept());
  await page.locator('[data-testid^="visit-"]').nth(1).getByTestId("cancel-visit").click();
  await expect(page.getByText("Visit cancelled")).toBeVisible();
  await expect(page.locator('[data-testid^="visit-"]')).toHaveCount(before - 1);

  // Pause the series from the plan page.
  await page.getByRole("link", { name: "Manage plan" }).click();
  await expect(page.getByRole("heading", { name: /Standard Cleaning/ })).toBeVisible();
  const inputs = page.locator('input[type="date"]');
  await inputs.nth(0).fill("2026-12-01");
  await inputs.nth(1).fill("2026-12-20");
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByText("Series paused")).toBeVisible();
  await expect(page.locator("h1").getByText("PAUSED")).toBeVisible();
  await page.getByRole("button", { name: "Resume series" }).click();
  await expect(page.getByText("Series resumed")).toBeVisible();

  // Settings save.
  await page.goto("/account/settings");
  await page.getByLabel("Email me offers and news").check();
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect(page.getByText("Saved.")).toBeVisible();
});

test("customer can rate and tip a completed visit; the cleaner's earnings include the tip", async ({
  page,
  request,
  browser,
}) => {
  // Reuse the cleaner flow to get a COMPLETED job for a fresh customer.
  const email = `rater-${Date.now()}@example.com`;
  const bookingNumber = await bookTorontoJob(page, email);

  const admin = await browser.newContext();
  const ap = await admin.newPage();
  await ap.goto("/admin/login");
  await ap.getByLabel("Email").fill("admin@msbsparkle.local");
  await ap.getByLabel("Password").fill("admin12345!");
  await ap.getByRole("button", { name: "Sign in" }).click();
  await ap.waitForURL(/\/admin$/);
  await ap.goto(`/admin/jobs?from=2020-01-01&to=2030-01-01&q=${bookingNumber}`);
  await ap.locator("table tbody tr td a").first().click();
  await ap.waitForURL(/\/admin\/jobs\/[^/?]+$/);
  await ap.getByRole("combobox").first().selectOption({ label: "Daniel Reyes" });
  await ap.getByLabel("Ignore conflicts").check();
  await ap.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(ap.getByText("Done").first()).toBeVisible();
  // Walk the job to COMPLETED via admin transitions.
  for (const s of ["→ IN PROGRESS", "→ COMPLETED"]) {
    await ap.getByRole("button", { name: s }).click();
    await expect(ap.getByText("Done").first()).toBeVisible();
    await ap.waitForTimeout(300);
  }
  await admin.close();

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a link" }).click();
  await page.goto(await magicLink(request, email));
  await expect(page).toHaveURL(/\/account/);
  await page.getByTestId("star-5").click();
  await page.getByTestId("tip-1000").click();
  await page.getByTestId("submit-rating").click();
  await expect(page.getByText("Thanks for the rating and the tip!")).toBeVisible();
  await expect(page.getByText("you rated ★★★★★")).toBeVisible();
});
