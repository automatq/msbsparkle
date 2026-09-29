import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const MAILPIT = "http://localhost:8025";

async function adminLogin(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("admin@msbsparkle.local");
  await page.getByLabel("Password").fill("admin12345!");
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
  await page.locator('[data-testid^="date-"]:not([disabled])').first().click();
  await page.locator('[data-testid^="window-"]:not([disabled])').first().click();
  await page.getByTestId("next").click();
  await page.getByLabel("First name").fill("Cleaner");
  await page.getByLabel("Last name").fill("Flow");
  await page.getByLabel("Email", { exact: true }).fill(`cleanerflow-${Date.now()}@example.com`);
  await page.getByLabel("Phone").fill("4165550177");
  await page.getByLabel("Street address").fill("2 Bloor St W");
  await page.getByLabel("City").fill("Toronto");
  await page.getByLabel("Postal code").fill("M4W 1A1");
  await page.getByTestId("next").click();
  await page.getByRole("heading", { name: "Payment" }).waitFor();
  await page.getByTestId("next").click();
  await page.waitForURL(/\/book\/confirmation\//);
  return (await page.getByTestId("booking-number").textContent())!.trim();
}

/** Reads the newest OTP code emailed to the cleaner (Twilio is not configured locally). */
async function latestOtp(request: APIRequestContext, email: string): Promise<string> {
  let code = "";
  await expect
    .poll(
      async () => {
        const res = await request.get(
          `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email} subject:"sign-in code"`)}`,
        );
        const body = (await res.json()) as { messages?: { Subject: string }[] };
        const m = body.messages?.[0]?.Subject.match(/(\d{6})/);
        code = m?.[1] ?? "";
        return code;
      },
      { timeout: 15_000 },
    )
    .toMatch(/^\d{6}$/);
  return code;
}

test("cleaner: OTP login, accept assignment, check in, checklist, photo, check out, earnings", async ({
  page,
  request,
  browser,
}) => {
  // 1. Customer books; admin assigns Amara (Toronto, 60% of job).
  const bookingNumber = await bookTorontoJob(page);
  const admin = await browser.newContext();
  const ap = await admin.newPage();
  await adminLogin(ap);
  await ap.goto(`/admin/jobs?from=2020-01-01&to=2030-01-01&q=${bookingNumber}`);
  await ap.locator("table tbody tr td a").first().click();
  await ap.waitForURL(/\/admin\/jobs\/[^/?]+$/);
  const jobUrl = ap.url();
  await ap.getByRole("combobox").first().selectOption({ label: "Amara Okafor" });
  await ap.getByLabel("Ignore conflicts").check(); // earlier runs may have booked the same window
  await ap.getByTestId("assign-manual").click();
  await expect(ap.getByText("Done")).toBeVisible();

  // 2. Cleaner signs in with a mobile code (delivered by email in dev).
  const cleanerEmail = "amara.okafor@cleaners.msbsparkle.local";
  await page.goto("/login/phone");
  await page.getByLabel("Mobile number").fill("416 555 1000");
  await page.getByRole("button", { name: "Text me a code" }).click();
  await expect(page.getByRole("heading", { name: "Enter your code" })).toBeVisible();
  const code = await latestOtp(request, cleanerEmail);
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/cleaner$/);
  await expect(page.getByRole("heading", { name: /Hi Amara/ })).toBeVisible();

  // 3. Open the job, check in, tick the checklist, add a photo, check out.
  const jobId = jobUrl.split("/").pop()!;
  await page.goto(`/cleaner/jobs/${jobId}`);
  await expect(page.getByText(bookingNumber)).toBeVisible();
  await page.getByTestId("check-in").click();
  await expect(page.getByText("Checked in")).toBeVisible();
  await expect(page.getByText("Checklist")).toBeVisible();
  const boxes = page.locator('input[data-testid^="check-"]');
  const n = await boxes.count();
  expect(n).toBeGreaterThan(5);
  for (let i = 0; i < n; i++) await boxes.nth(i).check();
  await page.getByTestId("photo-AFTER").setInputFiles({
    name: "after.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
      "base64",
    ),
  });
  await expect(page.getByText("Photo added")).toBeVisible();
  await expect(page.locator("img[alt='AFTER']")).toBeVisible();
  await page.getByTestId("check-out").click();
  await expect(page.getByText("Job complete")).toBeVisible();
  await expect(page.locator("main").getByText("COMPLETED", { exact: true })).toBeVisible();

  // 4. Earnings: 60% of the pre-tax total ($139 -> $83.40 for 2bd/1ba standard).
  await page.goto("/cleaner/earnings");
  await expect(page.getByText(bookingNumber)).toBeVisible();
  await expect(page.getByText("$83.40").first()).toBeVisible();

  // 5. Admin sees the job completed with check-in/out times and it is queued for payment.
  await ap.goto(jobUrl);
  await expect(ap.locator("main").getByText("COMPLETED", { exact: true }).first()).toBeVisible();
  await expect(ap.getByText(/in \d+:\d+ (AM|PM)/)).toBeVisible();
  await ap.goto("/admin/payments");
  await expect(ap.locator("table").first().getByText(bookingNumber)).toBeVisible();
  await admin.close();
});
