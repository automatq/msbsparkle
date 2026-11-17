import http from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test, type Page } from "@playwright/test";
import { Webhook } from "standardwebhooks";

// Needs WEBHOOKS_ALLOW_PRIVATE=1 on the app server (set in CI) so it may call 127.0.0.1.

type Received = { headers: Record<string, string>; body: string };

async function login(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("admin@msbsparkle.local");
  await page.getByLabel("Password").fill("admin12345!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/admin$/);
}

async function book(page: Page): Promise<string> {
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
  await page.getByLabel("First name").fill("Webhook");
  await page.getByLabel("Last name").fill("Test");
  await page.getByLabel("Email", { exact: true }).fill(`webhook-${Date.now()}@example.com`);
  await page.getByLabel("Phone").fill("4165550188");
  await page.getByLabel("Street address").fill("1 Bloor St E");
  await page.getByLabel("City").fill("Toronto");
  await page.getByLabel("Postal code").fill("M4W 1A1");
  await page.getByTestId("next").click();
  await page.getByRole("heading", { name: "Payment" }).waitFor();
  await page.getByTestId("next").click();
  await page.waitForURL(/\/book\/confirmation\//);
  return (await page.getByTestId("booking-number").textContent())!.trim();
}

test("admin adds a webhook endpoint; test events and new bookings arrive signed", async ({
  page,
}) => {
  const received: Received[] = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      received.push({ headers: req.headers as Record<string, string>, body });
      res.writeHead(200);
      res.end("ok");
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hooks`;

  try {
    await login(page);
    await page.goto("/admin/settings/webhooks");
    await expect(page.getByRole("heading", { name: "Webhooks" })).toBeVisible();
    await page.getByLabel("Endpoint URL").fill(url);
    await page.getByLabel("Description (optional)").fill("e2e");
    await page.getByTestId("webhook-create").click();
    const secret = (await page.getByTestId("webhook-secret").textContent())!.trim();
    expect(secret).toMatch(/^whsec_/);
    await page.getByRole("button", { name: "I've saved it" }).click();

    const card = page.getByTestId("webhook-endpoint").filter({ hasText: url });
    await card.getByTestId("webhook-test").click();
    await expect(page.getByText("Delivered (HTTP 200).")).toBeVisible();
    await expect(card.getByTestId("webhook-deliveries")).toContainText("webhook.test");

    const wh = new Webhook(secret);
    expect(wh.verify(received[0].body, received[0].headers)).toMatchObject({
      type: "webhook.test",
    });

    // A real booking is delivered right after the request (no Inngest in CI).
    const bookingNumber = await book(page);
    await expect
      .poll(() => received.map((r) => JSON.parse(r.body).type), { timeout: 20_000 })
      .toContain("booking.created");
    const created = received.find((r) => JSON.parse(r.body).type === "booking.created")!;
    const event = wh.verify(created.body, created.headers) as {
      data: { bookingNumber: string; customer: { firstName: string }; status: string };
    };
    expect(event.data).toMatchObject({
      bookingNumber,
      customer: { firstName: "Webhook" },
      status: "ACTIVE",
    });
  } finally {
    // Remove the endpoint so later specs don't try to reach the closed server.
    await page.goto("/admin/settings/webhooks");
    const card = page.getByTestId("webhook-endpoint").filter({ hasText: url });
    if (await card.count()) {
      page.once("dialog", (d) => d.accept());
      await card.getByRole("button", { name: "Delete" }).click();
      await expect(card).toHaveCount(0);
    }
    server.close();
  }
});
