import { expect, test, type Page } from "@playwright/test";

const scheme = (page: Page) =>
  page.evaluate(() => ({
    mantine: document.documentElement.getAttribute("data-mantine-color-scheme"),
    dark: document.documentElement.classList.contains("dark"),
  }));

test("admin dark mode switches both UIs, persists, and never leaks to the public site", async ({
  page,
}) => {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("admin@msbsparkle.local");
  await page.getByLabel("Password").fill("admin12345!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/admin$/);
  expect(await scheme(page)).toEqual({ mantine: "light", dark: false });

  await page.getByTestId("color-scheme-toggle").click();
  await page.getByRole("menuitem", { name: "Dark" }).click();
  await expect.poll(() => scheme(page)).toEqual({ mantine: "dark", dark: true });
  // Tailwind (legacy) pages pick it up too: the body uses the dark --background.
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).not.toBe("rgb(255, 255, 255)");

  // Applied before hydration on a full load (no flash): check right at DOMContentLoaded.
  await page.goto("/admin/regions", { waitUntil: "domcontentloaded" });
  expect(await scheme(page)).toEqual({ mantine: "dark", dark: true });

  // The public site stays light (ColorSchemeSync also resets it if the admin unmounts client-side).
  await page.goto("/");
  expect(await scheme(page)).toEqual({ mantine: "light", dark: false });
  await page.goto("/admin");
  await expect.poll(() => scheme(page)).toEqual({ mantine: "dark", dark: true });

  // Back to light for other specs sharing this browser profile.
  await page.getByTestId("color-scheme-toggle").click();
  await page.getByRole("menuitem", { name: "Light" }).click();
  await expect.poll(() => scheme(page)).toEqual({ mantine: "light", dark: false });
});
