import { Anchor, Code, Stack, Text, Title } from "@mantine/core";
import { CodeSnippet } from "@/components/admin/mantine/code-snippet";
import { PageHeader } from "@/components/admin/mantine/page-header";
import { EndpointCard, NewEndpointForm } from "@/components/admin/mantine/webhook-panels";
import { requireRole } from "@/modules/auth/session";
import { prisma } from "@/modules/db/client";
import { MAX_ENDPOINTS } from "@/modules/webhooks/manage";

export const dynamic = "force-dynamic";

const VERIFY_SNIPPET = `// npm install standardwebhooks
import { Webhook } from "standardwebhooks";

const wh = new Webhook(process.env.BOOKING_WEBHOOK_SECRET); // "whsec_..."

export async function POST(req) {
  const body = await req.text(); // the raw body, before JSON.parse
  const event = wh.verify(body, Object.fromEntries(req.headers)); // throws if forged or stale
  // Use event.id (same as the webhook-id header) to ignore repeats.
  if (event.type === "booking.created") { /* ... */ }
  return new Response("ok");
}`;

export default async function WebhooksPage() {
  const ctx = await requireRole("/admin/login", "SUPER_ADMIN");
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { organizationId: ctx.orgId },
    orderBy: { createdAt: "asc" },
    include: { deliveries: { orderBy: { createdAt: "desc" }, take: 15 } },
  });
  return (
    <Stack gap="xl" maw={960}>
      <PageHeader
        title="Webhooks"
        description="Send bookings, visits and payments to your own systems (CRM, accounting, Zapier, Make, a custom app) as they happen. Each event is a signed JSON POST; failed deliveries are retried for about two days."
      />

      {endpoints.length ? (
        <Stack gap="md">
          {endpoints.map((e) => (
            <EndpointCard
              key={e.id}
              endpoint={{
                id: e.id,
                url: e.url,
                description: e.description,
                events: e.events,
                enabled: e.enabled,
                deliveries: e.deliveries.map((d) => ({
                  id: d.id,
                  eventType: d.eventType,
                  status: d.status,
                  attempts: d.attempts,
                  lastStatusCode: d.lastStatusCode,
                  lastError: d.lastError,
                  createdAt: d.createdAt.toISOString(),
                  nextAttemptAt: d.nextAttemptAt?.toISOString() ?? null,
                })),
              }}
            />
          ))}
        </Stack>
      ) : null}

      <Stack gap="sm">
        <Title order={2} fz="md" fw={600}>
          Add an endpoint
        </Title>
        <NewEndpointForm disabled={endpoints.length >= MAX_ENDPOINTS} />
      </Stack>

      <Stack gap="xs">
        <Title order={2} fz="md" fw={600}>
          Verifying requests
        </Title>
        <Text size="sm" c="dimmed">
          Requests follow the{" "}
          <Anchor href="https://www.standardwebhooks.com" target="_blank" rel="noreferrer">
            Standard Webhooks
          </Anchor>{" "}
          format: headers <Code>webhook-id</Code>, <Code>webhook-timestamp</Code> and{" "}
          <Code>webhook-signature</Code>, so any Standard Webhooks library can check them. Reply
          with a 2xx status within 10 seconds; anything else is retried. The same event can arrive
          more than once, and events can arrive out of order.
        </Text>
        <CodeSnippet code={VERIFY_SNIPPET} />
      </Stack>
    </Stack>
  );
}
