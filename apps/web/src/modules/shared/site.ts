/**
 * Site-wide identity, resolved once with sensible fallbacks so a fresh deployment needs almost no
 * configuration. Safe to import from client components.
 */

export const brandName: string = process.env.NEXT_PUBLIC_BRAND_NAME || "MSB Sparkle";

/**
 * Public base URL, no trailing slash: NEXT_PUBLIC_APP_URL, else the Vercel project's production
 * domain (exposed automatically by Vercel), else localhost for development.
 */
export const siteUrl: string = (
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000")
).replace(/\/+$/, "");

/** Sender for all email. Resend's shared test sender works until a domain is verified. */
export function emailFrom(): string {
  return process.env.EMAIL_FROM || `${brandName} <onboarding@resend.dev>`;
}
