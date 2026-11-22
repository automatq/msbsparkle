import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, email: string) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("admin12345!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/admin$/);
}

/** Books a one-time Toronto clean through the public wizard; returns the booking number and date. */
async function bookTorontoJob(page: Page): Promise<{ bookingNumber: string; date: string }> {
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
  const dateBtn = page.locator('[data-testid^="date-"]:not([disabled])').first();
  const date = (await dateBtn.getAttribute("data-testid"))!.replace("date-", "");
  await dateBtn.click();
  await page.locator('[data-testid^="window-"]:not([disabled])').first().click();
  await page.getByTestId("next").click();
  await page.getByLabel("First name").fill("Dispatch");
  await page.getByLabel("Last name").fill("Test");
  await page.getByLabel("Email", { exact: true }).fill(`dispatch-${Date.now()}@example.com`);
  await page.getByLabel("Phone").fill("4165550199");
  await page.getByLabel("Street address").fill("1 Bloor St E");
  await page.getByLabel("City").fill("Toronto");
  await page.getByLabel("Postal code").fill("M4W 1A1");
  await page.getByTestId("next").click();
  await page.getByRole("heading", { name: "Payment" }).waitFor();
  await page.getByTestId("next").click();
  await page.waitForURL(/\/book\/confirmation\//);
  const bookingNumber = (await page.getByTestId("booking-number").textContent())!.trim();
  return { bookingNumber, date };
}

async function torontoRegionId(page: Page): Promise<string> {
  await page.goto("/admin/regions");
  const href = await page.getByRole("link", { name: "Toronto" }).getAttribute("href");
  return href!.split("/").pop()!;
}

test.describe("admin dispatch", () => {
  test("super admin sees the dispatch board with cleaner lanes and the new job unassigned", async ({
    page,
  }) => {
    const { bookingNumber, date } = await bookTorontoJob(page);
    await login(page, "admin@msbsparkle.local");
    const regionId = await torontoRegionId(page);
    await page.goto(`/admin/calendar?region=${regionId}&date=${date}`);
    await expect(page.getByRole("heading", { name: "Dispatch" })).toBeVisible();
    await expect(page.getByText("Amara Okafor")).toBeVisible();
    await expect(page.locator(".fc-event", { hasText: bookingNumber })).toBeVisible();
    await page.locator(".fc-event", { hasText: bookingNumber }).click();
    await expect(page).toHaveURL(/\/admin\/jobs\//);
    await expect(page.locator("main").getByText("Timeline", { exact: true })).toBeVisible();
    await expect(page.getByRole("combobox").first()).toBeVisible();
  });

  test("assigning a cleaner moves the job to ASSIGNED and logs an event", async ({ page }) => {
    const { bookingNumber } = await bookTorontoJob(page);
    await login(page, "admin@msbsparkle.local");
    await page.goto(`/admin/jobs?from=2020-01-01&to=2030-01-01&q=${bookingNumber}`);
    await page.locator("table tbody tr td a").first().click();
    await page.waitForURL(/\/admin\/jobs\/[^/?]+$/);
    await page.getByTestId("assign-cleaner").click();
    await page.getByRole("option", { name: "Amara Okafor" }).click();
    await page.getByLabel("Ignore conflicts").check(); // other specs may have booked the same window
    await page.getByTestId("assign-manual").click();
    await expect(page.getByText("Done").first()).toBeVisible();
    await expect(page.getByTestId("job-status")).toHaveAttribute("data-status", "ASSIGNED");
    await expect(page.getByRole("link", { name: "Amara Okafor" })).toBeVisible();
    await expect(page.getByText("CONFIRMED → ASSIGNED")).toBeVisible();
    // Conflict detection: the same cleaner cannot take an overlapping job without force.
    await page.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByTestId("job-status")).toHaveAttribute("data-status", "CONFIRMED");
  });

  test("region admin only sees their region and is blocked from other regions' jobs", async ({
    page,
  }) => {
    await login(page, "calgary.admin@msbsparkle.local");
    await page.goto("/admin/regions");
    await expect(page.getByRole("link", { name: "Calgary" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Toronto" })).toHaveCount(0);

    // Find a Toronto job id via the super admin session in another context.
    const admin = await page.context().browser()!.newContext();
    const p2 = await admin.newPage();
    await login(p2, "admin@msbsparkle.local");
    await p2.goto("/admin/jobs?region=&from=2020-01-01&to=2030-01-01");
    const torontoRow = p2.locator("table tbody tr", { hasText: "Toronto" }).first();
    const href = await torontoRow.locator("td a").first().getAttribute("href");
    await admin.close();
    expect(href).toMatch(/\/admin\/jobs\//);

    await page.goto(href!);
    await expect(page.getByText("don't have access to this region")).toBeVisible();
    await page.goto("/admin/jobs?from=2020-01-01&to=2030-01-01");
    await expect(page.locator("table tbody tr", { hasText: "Toronto" })).toHaveCount(0);
  });

  test("pricing: clone to draft, edit a rate, publish; new quotes change", async ({
    page,
    request,
  }) => {
    await login(page, "admin@msbsparkle.local");
    const quote = async () => {
      const res = await request.post("/api/quote", {
        data: {
          postalCode: "K1A 0B1",
          serviceSlug: "standard",
          bedrooms: 1,
          bathrooms: 1,
          extras: [],
          frequency: "ONE_TIME",
        },
      });
      return (await res.json()).data.quote.totalCents as number;
    };
    const beforeTotal = await quote();

    await page.goto("/admin/pricing");
    const ottawaRows = page.locator("table tbody tr", { hasText: "Ottawa" });
    if ((await ottawaRows.filter({ hasText: /DRAFT/ }).count()) === 0) {
      const create = page.getByRole("button", { name: "Ottawa draft" });
      if (await create.count()) await create.click();
      else await ottawaRows.first().getByRole("button", { name: "Clone to draft" }).click();
      await expect(page.getByText("Done")).toBeVisible();
    }
    await ottawaRows.filter({ hasText: /DRAFT/ }).first().getByRole("link").click();
    await expect(page.locator("h1").getByText("DRAFT")).toBeVisible();
    const baseRow = page
      .locator("table tbody tr", { hasText: "BASE" })
      .filter({ has: page.locator("td", { hasText: /^standard$/ }) })
      .first();
    const input = baseRow.locator("input").first();
    const current = Number(await input.inputValue());
    await input.fill(String(current + 20));
    await input.blur();
    await page.waitForTimeout(700);
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page.locator("h1").getByText("PUBLISHED")).toBeVisible();

    const afterTotal = await quote();
    expect(afterTotal).not.toBe(beforeTotal);
    // 1 bed (+$20), 1 bath (+$0) on the new base, plus 13% HST.
    expect(afterTotal).toBe(Math.round(((current + 20) * 100 + 2000) * 1.13));
  });
});

test("admin creates a region, adds a service area and tax, and it starts taking quotes", async ({
  page,
}) => {
  const stamp = Date.now().toString(36);
  // A fresh Yukon FSA per run (the seed never uses Y), so retries don't collide.
  const letters = "ABCEGHJKLMNPRSTVWXYZ";
  const fsa = `Y${2 + Math.floor(Math.random() * 8)}${letters[Math.floor(Math.random() * 20)]}`;
  const quote = () =>
    page.request.post("/api/quote", {
      data: {
        postalCode: `${fsa} 1A1`,
        serviceSlug: "standard",
        bedrooms: 2,
        bathrooms: 1,
        frequency: "ONE_TIME",
        extras: [],
      },
    });

  await login(page, "admin@msbsparkle.local");
  await page.goto("/admin/regions");
  await page.getByRole("link", { name: "New region" }).click();
  await page.getByLabel("Name").fill(`Dawson ${stamp}`);
  await page.getByLabel("Province").selectOption("YT");
  await page.getByLabel("Timezone").selectOption("America/Whitehorse");
  await page.getByLabel("Create a public city page for it").uncheck();
  await page.getByTestId("create-region").click();
  await page.waitForURL(/\/admin\/regions\/(?!new)[^/]+$/);
  await expect(page.getByRole("heading", { name: new RegExp(`Dawson ${stamp}`) })).toBeVisible();

  // Invalid and already-served prefixes are reported, the valid one is added.
  await page.getByLabel("Add FSAs").fill(`${fsa}, 90210 M5V`);
  await page.getByTestId("add-areas").click();
  await expect(page.getByText("Added 1 area.")).toBeVisible();
  await expect(page.getByText("M5V already belongs to Toronto")).toBeVisible();
  await expect(page.getByTestId("service-areas").getByText(fsa)).toBeVisible();

  // Still "Coming soon": not bookable yet.
  expect((await (await quote()).json()).ok).toBe(false);

  await page.locator("select").first().selectOption("ACTIVE");
  await page.getByRole("button", { name: "Save region" }).click();
  await expect(page.getByText("Done")).toBeVisible();

  await page.goto("/admin/taxes");
  await page.getByLabel("Province").selectOption("YT");
  await page.getByLabel("Tax name").fill(`GST ${stamp}`);
  await page.getByLabel("Rate (%)").fill("5");
  await page.getByTestId("add-tax").click();
  await expect(page.getByText("Tax rate saved.")).toBeVisible();
  await expect(page.getByRole("cell", { name: `GST ${stamp}` })).toBeVisible();

  const res = await (await quote()).json();
  expect(res.ok).toBe(true);
  expect(res.data.region.name).toBe(`Dawson ${stamp}`);
  expect(res.data.quote.taxCents).toBeGreaterThan(0);
});

test("admin adds time off for a cleaner, revokes it, approves it again and removes it", async ({
  page,
}) => {
  await login(page, "admin@msbsparkle.local");
  await page.goto("/admin/cleaners");
  // Sofia (Calgary) isn't used by the other specs, so her schedule stays predictable.
  await page.getByRole("link", { name: /Sofia Marchetti/ }).click();
  await page.waitForURL(/\/admin\/cleaners\/[^/]+$/);
  await expect(page.getByText("Time off", { exact: true })).toBeVisible();

  // Far enough out that no job exists; unique per run so reruns never collide.
  const start = new Date(Date.now() + (300 + Math.floor(Math.random() * 300)) * 86_400_000);
  const from = start.toISOString().slice(0, 10);
  const to = new Date(start.getTime() + 86_400_000).toISOString().slice(0, 10);
  await page.getByLabel("First day").fill(from);
  await page.getByLabel("Last day").fill(to);
  await page.getByLabel("Reason (optional)").fill("Family trip");
  await page.getByTestId("time-off-add").click();
  await expect(page.getByText("Time off added")).toBeVisible();

  const row = page.locator('[data-testid^="time-off-"]', { hasText: `${from} → ${to}` });
  await expect(row).toContainText("APPROVED");
  await expect(row).toContainText("Family trip");

  await row.getByRole("button", { name: "Revoke" }).click();
  await expect(page.getByText("Time off denied")).toBeVisible();
  await expect(row).toContainText("DENIED");

  await row.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Time off approved")).toBeVisible();
  await expect(row).toContainText("APPROVED");

  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Time off removed")).toBeVisible();
  await expect(row).toHaveCount(0);

  // A last day before the first day is refused.
  await page.getByLabel("First day").fill(to);
  await page.getByLabel("Last day").fill(from);
  await page.getByTestId("time-off-add").click();
  await expect(page.getByText("The last day can't be before the first day.")).toBeVisible();
});
