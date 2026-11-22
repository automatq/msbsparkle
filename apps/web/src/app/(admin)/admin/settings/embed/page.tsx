import { Code, Paper, Stack, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";
import { CodeSnippet } from "@/components/admin/mantine/code-snippet";
import { PageHeader } from "@/components/admin/mantine/page-header";
import { requireRole } from "@/modules/auth/session";
import { siteUrl } from "@/modules/shared/site";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack gap="xs">
      <Title order={2} fz="md" fw={600}>
        {title}
      </Title>
      {children}
    </Stack>
  );
}

export default async function EmbedSettingsPage() {
  await requireRole("/admin/login", "SUPER_ADMIN", "REGION_ADMIN");
  const restricted = !!process.env.EMBED_ALLOWED_ORIGINS?.trim();
  const basic = `<div data-booking-widget></div>
<script src="${siteUrl}/embed.js" async></script>`;
  const prefilled = `<div data-booking-widget data-service="deep" data-frequency="BIWEEKLY"></div>
<script src="${siteUrl}/embed.js" async></script>`;
  const tracking = `<script>
  document.addEventListener("booking-widget:complete", function (e) {
    // e.detail.bookingNumber, e.g. send a conversion to Google Analytics:
    if (window.gtag) gtag("event", "purchase", { transaction_id: e.detail.bookingNumber });
  });
</script>`;
  return (
    <Stack gap="xl" maw={960}>
      <PageHeader
        title="Website booking widget"
        description="Put the full booking form on your existing website (WordPress, Wix, Squarespace, Webflow…). Paste this where the form should appear, in an HTML or embed block. It resizes itself to fit, and bookings land here like any other."
      />
      <Section title="Embed code">
        <CodeSnippet code={basic} testId="embed-snippet" />
      </Section>
      <Section title="Optional: prefill">
        <Text size="sm" c="dimmed">
          Add <Code>data-postal</Code>, <Code>data-service</Code>, <Code>data-bedrooms</Code>,{" "}
          <Code>data-bathrooms</Code> or <Code>data-frequency</Code> (ONE_TIME, WEEKLY, BIWEEKLY,
          EVERY_4_WEEKS), e.g. for a &ldquo;deep clean&rdquo; landing page:
        </Text>
        <CodeSnippet code={prefilled} />
      </Section>
      <Section title="Optional: track bookings">
        <Text size="sm" c="dimmed">
          The widget fires a <Code>booking-widget:complete</Code> event on your page when someone
          books, for analytics or ad conversions.
        </Text>
        <CodeSnippet code={tracking} />
      </Section>
      <Section title="Which websites can use it">
        <Text size="sm" c="dimmed">
          {restricted ? (
            <>
              Restricted to: <Code>{process.env.EMBED_ALLOWED_ORIGINS}</Code>.
            </>
          ) : (
            <>
              Any website can show the widget. To allow only your own site, set{" "}
              <Code>EMBED_ALLOWED_ORIGINS</Code> (e.g.{" "}
              <Code>https://acme.com https://www.acme.com</Code>) and redeploy.
            </>
          )}
        </Text>
      </Section>
      <Section title="Preview">
        <Text size="xs" c="dimmed">
          The widget itself is always light, like the rest of your public site.
        </Text>
        <Paper p={8}>
          <iframe
            src="/embed/book"
            title="Booking widget preview"
            style={{ display: "block", width: "100%", height: 640, border: 0, borderRadius: 8 }}
          />
        </Paper>
      </Section>
    </Stack>
  );
}
