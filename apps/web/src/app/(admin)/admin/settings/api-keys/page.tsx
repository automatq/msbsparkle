import { Code, Stack, Text, Title } from "@mantine/core";
import { ApiKeyTable, NewApiKey } from "@/components/admin/mantine/api-keys-panel";
import { CodeSnippet } from "@/components/admin/mantine/code-snippet";
import { PageHeader } from "@/components/admin/mantine/page-header";
import { MAX_ACTIVE_KEYS } from "@/modules/api/keys";
import { RATE_LIMIT_PER_MINUTE } from "@/modules/api/http";
import { requireRole } from "@/modules/auth/session";
import { prisma } from "@/modules/db/client";
import { siteUrl } from "@/modules/shared/site";

export const dynamic = "force-dynamic";

export default async function ApiKeysPage() {
  const ctx = await requireRole("/admin/login", "SUPER_ADMIN");
  const keys = await prisma.apiKey.findMany({
    where: { organizationId: ctx.orgId },
    orderBy: [{ revokedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
  });
  const active = keys.filter((k) => !k.revokedAt).length;
  const example = `curl ${siteUrl}/api/v1/jobs?from=2026-12-01 \\
  -H "Authorization: Bearer sk_..."`;

  return (
    <Stack gap="lg" maw={960}>
      <PageHeader
        title="API keys"
        description="Let your own apps read bookings, visits, customers and payments."
      />
      <Stack gap="sm">
        <Title order={2} fz="md" fw={600}>
          Create a key
        </Title>
        <NewApiKey disabled={active >= MAX_ACTIVE_KEYS} />
      </Stack>
      <Stack gap="sm">
        <Title order={2} fz="md" fw={600}>
          Keys
        </Title>
        <ApiKeyTable
          keys={keys.map((k) => ({
            id: k.id,
            name: k.name,
            prefix: k.prefix,
            createdAt: k.createdAt.toISOString(),
            lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
            revokedAt: k.revokedAt?.toISOString() ?? null,
          }))}
        />
      </Stack>
      <Stack gap="xs">
        <Title order={2} fz="md" fw={600}>
          Using the API
        </Title>
        <Text size="sm" c="dimmed">
          Read-only JSON over HTTPS. Send the key as a bearer token; each key may make{" "}
          {RATE_LIMIT_PER_MINUTE} requests a minute. Endpoints: <Code>/api/v1/bookings</Code>,{" "}
          <Code>/api/v1/jobs</Code>, <Code>/api/v1/customers</Code>, <Code>/api/v1/payments</Code>{" "}
          (each also by <Code>/:id</Code>) and <Code>/api/v1/me</Code> to test a key. Keep keys on
          servers only: never put one in a website or mobile app. The objects match the webhook
          payloads; the full reference is in docs/API.md.
        </Text>
        <CodeSnippet code={example} />
      </Stack>
    </Stack>
  );
}
