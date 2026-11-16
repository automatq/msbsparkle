import { CopySnippet } from "@/components/admin/copy-snippet";
import { EndpointCard, NewEndpointForm } from "@/components/admin/webhook-panels";
import { requireRole } from "@/modules/auth/session";
import { prisma } from "@/modules/db/client";
import { MAX_ENDPOINTS } from "@/modules/webhooks/manage";

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
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Webhooks</h1>
        <p className="text-sm text-muted-foreground">
          Send bookings, visits and payments to your own systems (CRM, accounting, Zapier, Make, a
          custom app) as they happen. Each event is a signed JSON <code>POST</code>; failed
          deliveries are retried for about two days.
        </p>
      </div>

      <section className="space-y-4">
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
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Add an endpoint</h2>
        <NewEndpointForm disabled={endpoints.length >= MAX_ENDPOINTS} />
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Verifying requests</h2>
        <p className="text-sm text-muted-foreground">
          Requests follow the{" "}
          <a
            className="underline"
            href="https://www.standardwebhooks.com"
            target="_blank"
            rel="noreferrer"
          >
            Standard Webhooks
          </a>{" "}
          format: headers <code>webhook-id</code>, <code>webhook-timestamp</code> and{" "}
          <code>webhook-signature</code>, so any Standard Webhooks library can check them. Reply
          with a 2xx status within 10 seconds; anything else is retried. The same event can arrive
          more than once, and events can arrive out of order.
        </p>
        <CopySnippet code={VERIFY_SNIPPET} />
      </section>
    </div>
  );
}
