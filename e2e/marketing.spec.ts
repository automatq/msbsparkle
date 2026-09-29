import { expect, test, type Page } from "@playwright/test";

async function adminLogin(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("admin@msbsparkle.local");
  await page.getByLabel("Password").fill("admin12345!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/admin$/);
}

test("city landing page renders with structured data and local details", async ({
  page,
  request,
}) => {
  const res = await page.goto("/house-cleaning-service-toronto");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /House cleaning services in Toronto/,
  );
  await expect(page.getByText("Neighbourhoods we serve")).toBeVisible();
  await expect(page.getByText("King West")).toBeVisible();
  await expect(page.getByTestId("estimator")).toBeVisible();
  const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
  const parsed = JSON.parse(ld!) as { "@type": string | string[] }[];
  expect(parsed.some((x) => JSON.stringify(x["@type"]).includes("LocalBusiness"))).toBe(true);
  expect(parsed.some((x) => x["@type"] === "FAQPage")).toBe(true);
  expect(parsed.some((x) => x["@type"] === "BreadcrumbList")).toBe(true);
  expect((await page.goto("/house-cleaning-service-nowhere"))?.status()).toBe(404);
  expect((await page.goto("/not-a-city"))?.status()).toBe(404);

  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/house-cleaning-service-toronto");
  expect(sitemap).toContain("/services/deep");
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /admin");
});

test("services, locations, reviews, faq and static pages render", async ({ page }) => {
  for (const [path, heading] of [
    ["/services", "Cleaning services"],
    ["/locations", "Where we clean"],
    ["/reviews", "Reviews"],
    ["/faq", "Frequently asked questions"],
    ["/guarantee", "100% happiness guarantee"],
    ["/contact", "Contact us"],
    ["/careers", "Clean with us"],
    ["/privacy", "Privacy policy"],
    ["/terms", "Terms of service"],
  ]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(heading);
  }
  await page.goto("/services/deep");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Deep Cleaning");
  await expect(page.getByText("Baseboards, door frames, switch plates")).toBeVisible();
});

test("gift card purchase (no Stripe) issues a code that applies in the booking wizard", async ({
  page,
  request,
}) => {
  test.skip(
    !!process.env.STRIPE_SECRET_KEY,
    "With Stripe the purchase goes through hosted Checkout",
  );
  const email = `gifter-${Date.now()}@example.com`;
  await page.goto("/gift-cards");
  await page.getByTestId("gift-5000").click();
  await page.getByLabel("Your email").fill(email);
  await page.getByRole("button", { name: /Buy \$50 gift card/ }).click();
  const issued = page.getByTestId("gift-issued");
  await expect(issued).toBeVisible();
  const code = (await issued.locator("span").textContent())!.trim();
  expect(code).toMatch(/^GC-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  await expect
    .poll(async () => {
      const r = await request.get(
        `http://localhost:8025/api/v1/search?query=${encodeURIComponent(`to:${email} subject:"gift card"`)}`,
      );
      return ((await r.json()) as { messages_count?: number; total?: number }).messages_count ?? 0;
    })
    .toBeGreaterThan(0);

  await page.goto("/book");
  await page.getByLabel("Postal code").fill("M5V 2T6");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByTestId("next").click();
  await page.getByTestId("next").click();
  await page.getByTestId("next").click();
  await page.getByLabel("Gift card").fill(code.toLowerCase());
  await page.getByTestId("gift-apply").click();
  await expect(page.getByTestId("gift-balance")).toContainText("$50.00");
});

test("admin creates a promo; it discounts the first clean in the wizard", async ({ page }) => {
  const code = `E2E${Date.now().toString(36).toUpperCase().slice(-5)}`;
  await adminLogin(page);
  await page.goto("/admin/promos");
  await page.getByTestId("promo-code").fill(code);
  await page.getByTestId("promo-value").fill("15");
  await page.getByRole("button", { name: "Save promo" }).click();
  await expect(page.getByText("Promo saved.")).toBeVisible();
  await expect(page.locator("table").getByText(code)).toBeVisible();

  await page.goto("/book");
  await page.getByLabel("Postal code").fill("M5V 2T6");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByTestId("next").click();
  await page.getByTestId("next").click();
  await page.getByTestId("next").click();
  await page.getByTestId("frequency-ONE_TIME").click();
  await expect(page.getByTestId("quote-total")).toHaveText("$157.07"); // 2bd/1ba standard + HST
  await page.getByLabel("Promo code").fill(code);
  await expect(page.getByTestId("quote-summary").getByText(`Promo ${code}`)).toBeVisible();
  await expect(page.getByTestId("quote-total")).toHaveText("$133.51"); // 13900 - 15% = 11815 + 13% HST
});

test("careers application lands in the admin queue; city editor republishes the page", async ({
  page,
}) => {
  const last = `Applicant${Date.now().toString(36).slice(-4)}`;
  await page.goto("/careers/apply");
  await page.getByLabel("First name").fill("Sam");
  await page.getByLabel("Last name").fill(last);
  await page.getByLabel("Email").fill(`${last.toLowerCase()}@example.com`);
  await page.getByLabel("Mobile").fill("4165550111");
  await page.getByLabel("City").selectOption("Calgary");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByTestId("apply-done")).toBeVisible();

  await adminLogin(page);
  await page.goto("/admin/applications");
  const row = page.locator("table tbody tr", { hasText: last });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Calgary (Calgary)");

  await page.goto("/admin/regions");
  await page.getByRole("link", { name: "Calgary" }).click();
  await page.getByRole("link", { name: "Airdrie" }).click();
  const intro = `Airdrie intro updated ${Date.now()}`;
  await page.getByTestId("city-intro").fill(intro);
  await page.getByRole("button", { name: "Save and republish" }).click();
  await expect(page.getByText("City page updated and republished.")).toBeVisible();
  await page.goto("/house-cleaning-service-airdrie");
  await expect(page.getByText(intro)).toBeVisible();
});
