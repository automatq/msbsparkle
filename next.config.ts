import type { NextConfig } from "next";

const common = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value:
      'camera=(self), geolocation=(self), microphone=(), payment=(self "https://js.stripe.com")',
  },
];

/**
 * Sites allowed to embed the booking widget (/embed/*), as a space- or comma-separated list of
 * origins, e.g. "https://acme.com https://www.acme.com". Defaults to any site, like other public
 * booking widgets; set it to lock the widget to the company's own website. Read at build time.
 */
const embedAncestors =
  (process.env.EMBED_ALLOWED_ORIGINS ?? "")
    .split(/[\s,]+/)
    .filter(Boolean)
    .join(" ") || "*";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Job photos are compressed in the browser first; Vercel caps request bodies at 4.5 MB.
      bodySizeLimit: "4mb",
    },
  },
  async headers() {
    return [
      {
        // Everything except the embeddable widget refuses to be framed (clickjacking).
        source: "/:path((?!embed(?:/|$)).*)",
        headers: [
          ...common,
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
          },
        ],
      },
      {
        source: "/embed/:path*",
        headers: [
          ...common,
          {
            key: "Content-Security-Policy",
            value: `frame-ancestors ${embedAncestors}; base-uri 'self'; object-src 'none'`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
