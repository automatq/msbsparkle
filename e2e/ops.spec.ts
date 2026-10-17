import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const MAILPIT = "http://localhost:8025";

async function adminLogin(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("admin@msbsparkle.local");
  await page.getByLabel("Password").fill("admin12345!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/admin$/);
}

async function book(
  page: Page,
  opts: { email: string; frequency: "ONE_TIME" | "BIWEEKLY"; dateIndex?: number },
): Promise<string> {
  await page.goto("/book");
  await page.getByLabel("Postal code").fill("M4W 1A1");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByTestId("service-standard").click();
  await page.getByTestId("next").click();
  await page.getByTestId("next").click();
  await page.getByTestId("next").click();
  await page.getByTestId(`frequency-${opts.frequency}`).click();
  await expect(page.getByTestId("quote-total")).toBeVisible();
  await page.getByTestId("next").click();
  await page
    .locator('[data-testid^="date-"]:not([disabled])')
    .nth(opts.dateIndex ?? 5)
    .click();
  await page.locator('[data-testid^="window-"]:not([disabled])').last().click();
  await page.getByTestId("next").click();
  await page.getByLabel("First name").fill("Ops");
  await page.getByLabel("Last name").fill("Tester");
  await page.getByLabel("Email", { exact: true }).fill(opts.email);
  await page.getByLabel("Phone").fill("4165550155");
  await page.getByLabel("Street address").fill("7 Bloor St W");
  await page.getByLabel("City").fill("Toronto");
  await page.getByLabel("Postal code").fill("M4W 1A1");
  await page.getByTestId("next").click();
  await page.getByRole("heading", { name: "Payment" }).waitFor();
  await page.getByTestId("next").click();
  await page.waitForURL(/\/book\/confirmation\//);
  return (await page.getByTestId("booking-number").textContent())!.trim();
}

async function openJob(page: Page, bookingNumber: string) {
  await page.goto(`/admin/jobs?from=2020-01-01&to=2030-01-01&q=${bookingNumber}`);
  await page.locator("table tbody tr td a").first().click();
  await page.waitForURL(/\/admin\/jobs\/[^/?]+$/);
}

async function mailLink(
  request: APIRequestContext,
  query: string,
  pattern: RegExp,
): Promise<string> {
  let found = "";
  await expect
    .poll(
      async () => {
        const res = await request.get(
          `${MAILPIT}/api/v1/search?query=${encodeURIComponent(query)}`,
        );
        const id = ((await res.json()) as { messages?: { ID: string; Subject: string }[] })
          .messages?.[0];
        if (!id) return "";
        const msg = (await (await request.get(`${MAILPIT}/api/v1/message/${id.ID}`)).json()) as {
          Text: string;
          HTML: string;
          Subject: string;
        };
        found = ((msg.Subject + " " + msg.Text + msg.HTML).match(pattern)?.[0] ?? "").replace(
          /&amp;/g,
          "&",
        );
        return found;
      },
      { timeout: 15_000 },
    )
    .not.toBe("");
  return found;
}

test("admin adjusts a visit price, completes it, approves the earning, creates a payout and marks it paid", async ({
  page,
}) => {
  const bookingNumber = await book(page, {
    email: `ops-${Date.now()}@example.com`,
    frequency: "ONE_TIME",
  });
  await adminLogin(page);
  await openJob(page, bookingNumber);

  // Price adjustment: -$10 pre-tax on a $139 visit => (139 - 10) * 1.13 = $145.77
  await page.getByTestId("adjust-amount").fill("-10");
  await page.getByTestId("adjust-apply").click();
  await expect(page.getByText("New total $145.77.")).toBeVisible();
  await expect(page.locator("main").getByText("$145.77").first()).toBeVisible();

  await page.getByRole("combobox").first().selectOption({ label: "Priya Nair" }); // flat $90 per job
  await page.getByLabel("Ignore conflicts").check();
  await page.getByTestId("assign-manual").click();
  await expect(page.getByText("Done").first()).toBeVisible();
  for (const s of ["→ IN PROGRESS", "→ COMPLETED"]) {
    await page.getByRole("button", { name: s }).click();
    await page.waitForTimeout(400);
  }
  await expect(page.locator("main").getByText("COMPLETED", { exact: true }).first()).toBeVisible();

  await page.goto("/admin/payouts");
  const pendingRow = page.locator("table").first().locator("tbody tr", { hasText: bookingNumber });
  await expect(pendingRow).toContainText("Priya Nair");
  await expect(pendingRow).toContainText("$90.00");
  await pendingRow.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText(/Approved 1 earning/)).toBeVisible();

  const ready = page.locator("table").nth(1).locator("tbody tr", { hasText: "Priya Nair" });
  await expect(ready).toBeVisible();
  await page.getByTestId("create-payouts").click();
  await expect(page.getByText(/Created \d+ payout/)).toBeVisible();

  const payoutRow = page
    .locator("table")
    .nth(2)
    .locator("tbody tr", { hasText: "Priya Nair" })
    .first();
  await expect(payoutRow).toContainText("PENDING");
  page.once("dialog", (d) => d.accept());
  await payoutRow.getByRole("button", { name: "Mark paid" }).click();
  await expect(page.getByText("Marked as paid.")).toBeVisible();
  await expect(
    page.locator("table").nth(2).locator("tbody tr", { hasText: "Priya Nair" }).first(),
  ).toContainText("PAID");
});

test("customer changes a bi-weekly plan to weekly for all future visits", async ({
  page,
  request,
}) => {
  const email = `plan-${Date.now()}@example.com`;
  await book(page, { email, frequency: "BIWEEKLY", dateIndex: 6 });
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a link" }).click();
  await page.goto(
    await mailLink(
      request,
      `to:${email} subject:"Sign in"`,
      /https?:\/\/localhost:3000\/api\/auth\/callback\/nodemailer[^\s"<]+/,
    ),
  );
  await expect(page).toHaveURL(/\/account/);
  await page.getByRole("link", { name: "Manage plan" }).click();
  const before = await page.locator("ul.divide-y li").count();

  await page.getByTestId("series-edit-open").click();
  await page.getByTestId("series-frequency").selectOption("WEEKLY");
  await page.getByTestId("series-preview-btn").click();
  const preview = page.getByTestId("series-preview");
  await expect(preview).toContainText("upcoming visit");
  await expect(preview).toContainText("schedule restarts");
  await page.getByTestId("series-apply").click();
  await expect(
    page.getByText("Your plan was updated and upcoming visits rescheduled."),
  ).toBeVisible();
  await expect(page.getByText(/^Weekly ·/)).toBeVisible();
  await expect.poll(async () => page.locator("ul.divide-y li").count()).toBeGreaterThan(before);
});

test("cleaner requests time off and an admin approves it from the dashboard", async ({
  page,
  request,
  browser,
}) => {
  await page.goto("/login/phone");
  await page.getByLabel("Mobile number").fill("416 555 1001"); // Daniel
  await page.getByRole("button", { name: "Text me a code" }).click();
  await expect(page.getByRole("heading", { name: "Enter your code" })).toBeVisible();
  const code = (
    await mailLink(
      request,
      'to:daniel.reyes@cleaners.msbsparkle.local subject:"sign-in code"',
      /\b\d{6}\b/,
    )
  ).trim();
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/cleaner$/);
  await page.goto("/cleaner/availability");
  const reason = `e2e ${Date.now()}`;
  const inputs = page.locator('input[type="date"]');
  await inputs.nth(0).fill("2027-02-01");
  await inputs.nth(1).fill("2027-02-05");
  await page.getByPlaceholder("Reason (optional)").fill(reason);
  await page.getByRole("button", { name: "Request" }).click();
  await expect(page.getByText("Time off requested")).toBeVisible();

  const admin = await browser.newContext();
  const ap = await admin.newPage();
  await adminLogin(ap);
  const row = ap.locator('[data-testid^="timeoff-"]', { hasText: reason });
  await expect(row).toContainText("Daniel Reyes");
  await row.getByRole("button", { name: "Approve" }).click();
  await expect(ap.getByText("Time off approved.")).toBeVisible();
  await expect(ap.locator('[data-testid^="timeoff-"]', { hasText: reason })).toHaveCount(0);
  await admin.close();

  await page.reload();
  await expect(page.locator("li", { hasText: reason })).toContainText("approved");
});
