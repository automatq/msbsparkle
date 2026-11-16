import { CopySnippet } from "@/components/admin/copy-snippet";
import { requireRole } from "@/modules/auth/session";
import { siteUrl } from "@/modules/shared/site";

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
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Website booking widget</h1>
        <p className="text-sm text-muted-foreground">
          Put the full booking form on your existing website (WordPress, Wix, Squarespace,
          Webflow…). Paste this where the form should appear, in an HTML or embed block. It resizes
          itself to fit, and bookings land here like any other.
        </p>
      </div>
      <section className="space-y-2">
        <h2 className="font-medium">Embed code</h2>
        <CopySnippet code={basic} testId="embed-snippet" />
      </section>
      <section className="space-y-2">
        <h2 className="font-medium">Optional: prefill</h2>
        <p className="text-sm text-muted-foreground">
          Add <code>data-postal</code>, <code>data-service</code>, <code>data-bedrooms</code>,{" "}
          <code>data-bathrooms</code> or <code>data-frequency</code> (ONE_TIME, WEEKLY, BIWEEKLY,
          EVERY_4_WEEKS), e.g. for a &ldquo;deep clean&rdquo; landing page:
        </p>
        <CopySnippet code={prefilled} />
      </section>
      <section className="space-y-2">
        <h2 className="font-medium">Optional: track bookings</h2>
        <p className="text-sm text-muted-foreground">
          The widget fires a <code>booking-widget:complete</code> event on your page when someone
          books, for analytics or ad conversions.
        </p>
        <CopySnippet code={tracking} />
      </section>
      <section className="space-y-2">
        <h2 className="font-medium">Which websites can use it</h2>
        <p className="text-sm text-muted-foreground">
          {restricted ? (
            <>
              Restricted to: <code>{process.env.EMBED_ALLOWED_ORIGINS}</code>.
            </>
          ) : (
            <>
              Any website can show the widget. To allow only your own site, set{" "}
              <code>EMBED_ALLOWED_ORIGINS</code> (e.g.{" "}
              <code>https://acme.com https://www.acme.com</code>) and redeploy.
            </>
          )}
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="font-medium">Preview</h2>
        <div className="rounded-xl border p-2">
          <iframe
            src="/embed/book"
            title="Booking widget preview"
            className="h-[640px] w-full rounded-lg"
          />
        </div>
      </section>
    </div>
  );
}
