import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("admin@msbsparkle.local");
  await page.getByLabel("Password").fill("admin12345!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/admin$/);
}

const slugOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

test("admin adds a checklist, a service that uses it, and an add-on; customers can book them", async ({
  page,
}) => {
  const run = Date.now().toString(36);
  const checklist = `Pantry list ${run}`;
  const service = `Pantry reset ${run}`;
  const addOn = `Spice rack ${run}`;

  await login(page);
  await page.getByRole("link", { name: "Catalog" }).click();
  await expect(page.getByRole("heading", { name: "Catalog" })).toBeVisible();

  // Checklist with two items; the second one is required.
  await page.getByRole("tab", { name: "Checklists" }).click();
  await page.getByRole("button", { name: "Add checklist" }).click();
  const listDialog = page.getByRole("dialog", { name: "Add a checklist" });
  await listDialog.getByLabel("Name").fill(checklist);
  await listDialog.getByLabel("Room for item 1").fill("Pantry");
  await listDialog.getByLabel("Task 1", { exact: true }).fill("Empty the shelves");
  await listDialog.getByRole("button", { name: "Add item" }).click();
  await listDialog.getByLabel("Task 2", { exact: true }).fill("Wipe and restock");
  await listDialog.getByRole("checkbox", { name: "Required" }).nth(1).check();
  await listDialog.getByRole("button", { name: "Add checklist" }).click();
  await expect(page.getByText("Checklist added")).toBeVisible();
  const listRow = page.getByTestId(`checklist-${checklist}`);
  await expect(listRow).toContainText("2");
  await expect(listRow).toContainText("1 required");

  // Service: a flat-rate one needs its base price.
  await page.getByRole("tab", { name: "Services" }).click();
  await page.getByRole("button", { name: "Add service" }).click();
  const serviceDialog = page.getByRole("dialog", { name: "Add a service" });
  await serviceDialog.getByLabel("Name").fill(service);
  await serviceDialog.getByLabel("Description").fill("Shelves emptied, wiped and restocked.");
  await serviceDialog.getByLabel("Base price").fill("84.50");
  await serviceDialog.getByRole("combobox", { name: "Checklist" }).click();
  await page.getByRole("option", { name: checklist }).click();
  await serviceDialog.getByRole("button", { name: "Add service" }).click();
  await expect(page.getByText("Service added")).toBeVisible();
  const serviceRow = page.getByTestId(`service-${slugOf(service)}`);
  await expect(serviceRow).toContainText("From $84.50");
  await expect(serviceRow).toContainText(checklist);
  await expect(serviceRow).toContainText("Offered");

  // Add-on charged per item.
  await page.getByRole("tab", { name: "Add-ons" }).click();
  await page.getByRole("button", { name: "Add add-on" }).click();
  const extraDialog = page.getByRole("dialog", { name: "Add an add-on" });
  await extraDialog.getByLabel("Name").fill(addOn);
  await extraDialog.getByText("Per item", { exact: true }).click();
  await extraDialog.getByLabel("Most a customer can order").fill("4");
  await extraDialog.getByLabel("Price per item").fill("12");
  await extraDialog.getByRole("button", { name: "Add add-on" }).click();
  await expect(page.getByText("Add-on added")).toBeVisible();
  const extraRow = page.getByTestId(`extra-${slugOf(addOn)}`);
  await expect(extraRow).toContainText("$12.00 each");
  await expect(extraRow).toContainText("Up to 4");

  // The public booking form offers the new service and prices it.
  await page.goto("/book");
  await page.getByLabel("Postal code").fill("M4W 1A1");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByTestId(`service-${slugOf(service)}`).click();
  await page.getByTestId("next").click(); // home size
  await page.getByTestId("next").click(); // extras
  await expect(page.getByTestId(`extra-${slugOf(addOn)}`)).toBeVisible();

  // Turn the service off: it leaves the booking form. Then clean up.
  await page.goto("/admin/catalog");
  await serviceRow.getByRole("button", { name: `Edit ${service}` }).click();
  const edit = page.getByRole("dialog", { name: "Edit service" });
  // Mantine hides the real switch input behind its track, so toggle it from the keyboard.
  const offered = edit.getByRole("switch", { name: "Offer this service to customers" });
  await offered.focus();
  await page.keyboard.press("Space");
  await expect(offered).not.toBeChecked();
  await edit.getByRole("button", { name: "Save service" }).click();
  await expect(page.getByText("Service saved")).toBeVisible();
  await expect(serviceRow).toContainText("Off");
  await page.goto("/book");
  await page.getByLabel("Postal code").fill("M4W 1A1");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByTestId("service-standard")).toBeVisible();
  await expect(page.getByTestId(`service-${slugOf(service)}`)).toHaveCount(0);

  await page.goto("/admin/catalog");
  page.on("dialog", (d) => d.accept());
  await serviceRow.getByRole("button", { name: `Delete ${service}` }).click();
  await expect(page.getByText("Service deleted")).toBeVisible();
  await expect(serviceRow).toHaveCount(0);
  await page.getByRole("tab", { name: "Add-ons" }).click();
  await extraRow.getByRole("button", { name: `Delete ${addOn}` }).click();
  await expect(page.getByText("Add-on deleted")).toBeVisible();
  await page.getByRole("tab", { name: "Checklists" }).click();
  await listRow.getByRole("button", { name: `Delete ${checklist}` }).click();
  await expect(page.getByText("Checklist deleted")).toBeVisible();
  await expect(listRow).toHaveCount(0);
});
