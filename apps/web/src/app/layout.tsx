import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";
import { locale } from "@/modules/shared/country";
import { brandName, siteUrl } from "@/modules/shared/site";

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const brand = brandName;

export const metadata: Metadata = {
  title: { default: `${brand} | Professional House Cleaning`, template: `%s | ${brand}` },
  description:
    "Book trusted, background-checked cleaners online in 60 seconds. Instant pricing, 100% happiness guarantee.",
  metadataBase: new URL(siteUrl),
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang={locale}
      // Light by default, so Mantine's styles apply before hydration. The admin may switch to dark
      // (see (admin)/layout.tsx); that changes these attributes before React hydrates.
      data-mantine-color-scheme="light"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        {children}
        <Toaster richColors position="top-center" />
      </body>
      {process.env.NEXT_PUBLIC_GA_ID ? (
        <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID} />
      ) : null}
    </html>
  );
}
