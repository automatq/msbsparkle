import { expect, test } from "@playwright/test";

test("homepage renders and links to booking", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("House cleaning");
  await expect(page.getByRole("link", { name: "Get an instant price" })).toHaveAttribute(
    "href",
    "/book",
  );
});

test("admin area redirects anonymous users to admin login", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);
});

test("seeded super admin can sign in", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(process.env.SEED_ADMIN_EMAIL ?? "admin@msbsparkle.local");
  await page.getByLabel("Password").fill(process.env.SEED_ADMIN_PASSWORD ?? "admin12345!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});
