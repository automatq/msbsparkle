import { expect, test } from "@playwright/test";

const unique = Date.now().toString(36);
const email = `e2e-${unique}@example.com`;

test("instant estimator returns a price for a Toronto postal code", async ({ page }) => {
  await page.goto("/");
  const form = page.getByTestId("estimator");
  await form.getByLabel("Postal code").fill("M5V 2T6");
  await form.getByLabel("Bedrooms").selectOption("3");
  await form.getByLabel("Bathrooms").selectOption("2");
  await form.getByRole("button", { name: "See my price" }).click();
  // 9900 + 6000 + 3000 = 18900 + 13% HST = 21357
  await expect(page.getByTestId("estimate-total")).toHaveText("$213.57");
});

test("out-of-area postal code offers a notify-me form", async ({ page }) => {
  await page.goto("/book");
  await page.getByLabel("Postal code").fill("X0A 0A0");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("We're not in X0A yet.")).toBeVisible();
});

test("full booking flow without Stripe creates a booking and sends the confirmation email", async ({
  page,
  request,
}) => {
  test.skip(!!process.env.STRIPE_SECRET_KEY, "Stripe configured; card step covered separately");
  await page.goto("/book");
  await page.getByLabel("Postal code").fill("M5V 2T6");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "What kind of cleaning?" })).toBeVisible();
  await page.getByTestId("service-standard").click();
  await page.getByTestId("next").click();

  await expect(page.getByRole("heading", { name: "Tell us about your home" })).toBeVisible();
  await page.getByRole("button", { name: "More Bedrooms" }).click(); // 2 -> 3
  await page.getByRole("button", { name: "More Bathrooms" }).click(); // 1 -> 1.5
  await page.getByRole("button", { name: "More Bathrooms" }).click(); // 1.5 -> 2
  await page.getByTestId("next").click();

  await page.getByTestId("extra-inside-fridge").check();
  await page.getByTestId("next").click();

  await page.getByTestId("frequency-BIWEEKLY").click();
  // subtotal 18900 + 3500 = 22400; -15% = 19040; HST 2475 => 21515
  await expect(page.getByTestId("quote-total")).toHaveText("$215.15");
  await page.getByTestId("next").click();

  await expect(page.getByRole("heading", { name: "Pick a date and arrival window" })).toBeVisible();
  const firstDate = page.locator('[data-testid^="date-"]:not([disabled])').first();
  await firstDate.click();
  const firstWindow = page.locator('[data-testid^="window-"]:not([disabled])').first();
  await firstWindow.click();
  await page.getByTestId("next").click();

  await page.getByLabel("First name").fill("Test");
  await page.getByLabel("Last name").fill("Customer");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Phone").fill("4165550123");
  await page.getByLabel("Street address").fill("120 King St W");
  await page.getByLabel("City").fill("Toronto");
  await page.getByLabel("Postal code").fill("M5V 2T6");
  await page.getByTestId("next").click();

  await expect(page.getByRole("heading", { name: "Payment" })).toBeVisible();
  await page.getByTestId("next").click();

  await expect(page).toHaveURL(/\/book\/confirmation\/MS-/);
  const bookingNumber = await page.getByTestId("booking-number").textContent();
  expect(bookingNumber).toMatch(/^MS-[A-Z2-9]{6}$/);
  await expect(page.getByText("$215.15")).toBeVisible();
  await expect(page.getByText("Next visits")).toBeVisible();

  // Confirmation email landed in Mailpit.
  await expect
    .poll(
      async () => {
        const res = await request.get(`http://localhost:8025/api/v1/search?query=to:${email}`);
        if (!res.ok()) return 0;
        const body = (await res.json()) as { messages_count?: number; total?: number };
        return body.messages_count ?? body.total ?? 0;
      },
      { timeout: 15_000 },
    )
    .toBeGreaterThan(0);
});
