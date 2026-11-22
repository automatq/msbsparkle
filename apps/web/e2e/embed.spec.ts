import { expect, test } from "@playwright/test";

/**
 * A company's own website, served by Playwright, that embeds the widget from the app. It lives on
 * 127.0.0.1 while the app is on localhost: a different origin (so this is real cross-site
 * embedding), but still a local address, which Chrome's Private Network Access rules require for
 * a plain-http page to load scripts from localhost.
 */
// Chrome blocks a page that Playwright serves from reaching localhost (Private/Local Network
// Access). Real company sites are public https pages embedding a public https app, so these
// checks are switched off for this file only.
test.use({
  launchOptions: {
    args: [
      "--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights",
    ],
  },
});

function hostSite(baseURL: string) {
  const u = new URL(baseURL);
  u.hostname = u.hostname === "localhost" ? "127.0.0.1" : "localhost";
  u.pathname = "/__company-site";
  return u.toString();
}

test("booking widget embeds on another site, resizes, and reports the booking", async ({
  page,
  baseURL,
}) => {
  const HOST = hostSite(baseURL!);
  await page.route(HOST, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><body>
        <h1>Acme Cleaning</h1>
        <div data-booking-widget data-postal="M4W 1A1"></div>
        <script>
          window.__bookings = [];
          document.addEventListener("booking-widget:complete", function (e) {
            window.__bookings.push(e.detail.bookingNumber);
          });
        </script>
        <script src="${baseURL}/embed.js" async></script>
      </body></html>`,
    }),
  );
  await page.goto(HOST);
  const iframe = page.locator("[data-booking-widget] iframe");
  const w = page.frameLocator("[data-booking-widget] iframe");

  // Prefilled from data-postal, and the iframe sized itself to its content.
  await expect(w.getByLabel("Postal code")).toHaveValue("M4W 1A1");
  await expect
    .poll(() => iframe.evaluate((el) => (el as HTMLIFrameElement).style.height))
    .toMatch(/^\d+px$/);

  await w.getByRole("button", { name: "Continue" }).click();
  await w.getByTestId("service-standard").click();
  await w.getByTestId("next").click();
  await w.getByTestId("next").click();
  await w.getByTestId("next").click();
  await w.getByTestId("frequency-ONE_TIME").click();
  await expect(w.getByTestId("quote-total")).toBeVisible();
  await w.getByTestId("next").click();
  await w.locator('[data-testid^="date-"]:not([disabled])').nth(3).click();
  await w.locator('[data-testid^="window-"]:not([disabled])').first().click();
  await w.getByTestId("next").click();
  await w.getByLabel("First name").fill("Embed");
  await w.getByLabel("Last name").fill("Widget");
  await w.getByLabel("Email", { exact: true }).fill(`embed-${Date.now()}@example.com`);
  await w.getByLabel("Phone").fill("4165550177");
  await w.getByLabel("Street address").fill("7 Bloor St W");
  await w.getByLabel("City").fill("Toronto");
  await w.getByTestId("next").click();
  await w.getByRole("heading", { name: "Payment" }).waitFor();
  await w.getByTestId("next").click();

  // The confirmation shows inside the widget, and the host page is told the booking number.
  const number = (await w.getByTestId("booking-number").textContent())!.trim();
  expect(number).toMatch(/^[A-Z0-9-]{4,}$/);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __bookings: string[] }).__bookings))
    .toEqual([number]);
  await expect(page).toHaveURL(HOST); // the visitor never left the company's site
});

test("only the widget can be framed by other sites", async ({ request }) => {
  const home = await request.get("/");
  expect(home.headers()["x-frame-options"]).toBe("DENY");
  expect(home.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");

  const widget = await request.get("/embed/book");
  expect(widget.status()).toBe(200);
  expect(widget.headers()["x-frame-options"]).toBeUndefined();
  expect(widget.headers()["content-security-policy"]).toContain("frame-ancestors *");

  const admin = await request.get("/admin/login");
  expect(admin.headers()["x-frame-options"]).toBe("DENY");
});

test("the widget preview doesn't scroll the admin page on load", async ({ page }) => {
  // Same-origin embed: an autofocused field inside the iframe would pull the page down to it.
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("admin@msbsparkle.local");
  await page.getByLabel("Password").fill("admin12345!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/admin$/);
  await page.goto("/admin/settings/embed");
  const preview = page.frameLocator('iframe[title="Booking widget preview"]');
  await expect(preview.getByLabel("Postal code")).toBeVisible();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});
