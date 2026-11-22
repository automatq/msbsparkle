import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";

const MAILPIT = "http://localhost:8025";
const PASSWORD = "four quiet garden lamps";

async function login(page: Page, email: string, password = "admin12345!") {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** A separate browser profile, i.e. another person. */
async function someoneElse(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

test("super admin invites a region admin, promotes them, then removes them", async ({
  page,
  browser,
}) => {
  const email = `nina-${Date.now()}@example.com`;
  await login(page, "admin@msbsparkle.local");
  await page.waitForURL(/\/admin$/);
  await page.getByRole("link", { name: "Team" }).click();
  await expect(page.getByRole("heading", { name: "Team" })).toBeVisible();
  // The signed-in admin is listed, and can't change themselves.
  await expect(page.getByTestId("team-admin@msbsparkle.local")).toContainText("(you)");

  // Invite: a region admin needs at least one region.
  await page.getByRole("button", { name: "Invite admin" }).click();
  const dialog = page.getByRole("dialog", { name: "Invite an admin" });
  await dialog.getByLabel("Name").fill("Nina New");
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText("Choose at least one region for a region admin.")).toBeVisible();
  await dialog.getByRole("combobox", { name: "Regions" }).click();
  await page.getByRole("option", { name: "Toronto" }).click();
  await page.keyboard.press("Escape"); // close the options list
  await dialog.getByRole("button", { name: "Send invitation" }).click();

  const row = page.getByTestId(`team-${email}`);
  await expect(row).toContainText("Nina New");
  await expect(row).toContainText("Region admin");
  await expect(row).toContainText("Toronto");
  await expect(row).toContainText("Invited");
  const link = await page.getByTestId("team-link").getByLabel("Set-password link").inputValue();
  expect(link).toMatch(/\/admin\/set-password\/[\w-]{40,}$/);
  const path = new URL(link).pathname;

  // The invited person chooses a password and signs in.
  const nina = await someoneElse(browser);
  await nina.page.goto(path);
  await expect(nina.page.getByText(`For ${email}`)).toBeVisible();
  await nina.page.getByLabel("New password").fill("short");
  await nina.page.getByLabel("Repeat password").fill("short");
  await nina.page.getByRole("button", { name: "Set password" }).click();
  await expect(nina.page.getByText("Use a password of at least 12 characters.")).toBeVisible();
  await nina.page.getByLabel("New password").fill(PASSWORD);
  await nina.page.getByLabel("Repeat password").fill(PASSWORD);
  await nina.page.getByRole("button", { name: "Set password" }).click();
  await expect(nina.page.getByTestId("password-set")).toBeVisible();
  // The link is single use.
  await nina.page.goto(path);
  await expect(nina.page.getByText("This link no longer works")).toBeVisible();

  await login(nina.page, email, PASSWORD);
  await nina.page.waitForURL(/\/admin$/);
  // A region admin has no Team page: not in the menu, and not by URL.
  await expect(nina.page.getByRole("link", { name: "Team" })).toHaveCount(0);
  await nina.page.goto("/admin/settings/team");
  await expect(nina.page).not.toHaveURL(/settings\/team/);

  // Promote to super admin. Their session ends so the new access applies at once.
  await page.reload();
  await expect(row).toContainText("Active");
  await row.getByRole("button", { name: /Actions for/ }).click();
  await page.getByRole("menuitem", { name: "Change access" }).click();
  const access = page.getByRole("dialog", { name: /Access for/ });
  await access.getByText("Super admin", { exact: true }).click();
  await access.getByRole("button", { name: "Save access" }).click();
  await expect(page.getByText("Access updated")).toBeVisible();
  await expect(row).toContainText("Super admin");

  await nina.page.goto("/admin");
  await expect(nina.page).toHaveURL(/\/admin\/login/);
  await login(nina.page, email, PASSWORD);
  await nina.page.waitForURL(/\/admin$/);
  await expect(nina.page.getByRole("link", { name: "Team" })).toBeVisible();

  // Remove from the team: signed out, and the password no longer gets them in.
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: /Actions for/ }).click();
  await page.getByRole("menuitem", { name: "Remove from team" }).click();
  await expect(page.getByText("Removed from the team")).toBeVisible();
  await expect(row).toHaveCount(0);

  await nina.page.goto("/admin");
  await expect(nina.page).toHaveURL(/\/admin\/login/);
  await login(nina.page, email, PASSWORD);
  await expect(nina.page.getByText("Invalid email, password or code.")).toBeVisible();
  await nina.context.close();
});

test("forgot password answers the same for any address", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  // The sign-in page has an Email field too: wait for the new page before typing.
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
  await page.getByLabel("Email").fill(`not-an-admin-${Date.now()}@example.com`);
  await page.getByRole("button", { name: "Email me a reset link" }).click();
  await expect(page.getByTestId("reset-requested")).toContainText("a reset link is on its way");
});

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
          /https?:\/\/localhost:\d+\/api\/auth\/callback\/nodemailer[^\s"<]+/,
        );
        link = m?.[0]?.replace(/&amp;/g, "&") ?? "";
        return link;
      },
      { timeout: 15_000 },
    )
    .toContain("/api/auth/callback/");
  return link;
}

test("an emailed sign-in link never gives admin access, even for an admin's address", async ({
  page,
  request,
}) => {
  // Needs the Mailpit inbox (docker compose, CI).
  const inbox = await request.get(`${MAILPIT}/api/v1/info`).catch(() => null);
  test.skip(!inbox?.ok(), "Mailpit is not running");

  const email = "calgary.admin@msbsparkle.local";
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  const link = new URL(await magicLink(request, email));
  await page.goto(link.pathname + link.search);
  await expect(page).not.toHaveURL(/\/login/);

  // Signed in by email only: the admin area stays closed. Password sign-in still works.
  await page.goto("/admin");
  await expect(page).not.toHaveURL(/\/admin/);
  await page.goto("/admin/jobs");
  await expect(page).not.toHaveURL(/\/admin/);
  await login(page, email);
  await page.waitForURL(/\/admin$/);
});
