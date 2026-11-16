import type { Metadata } from "next";
import { EmbedFrame } from "@/components/booking/embed-bridge";

export const metadata: Metadata = { robots: { index: false } };

/** Chrome-less layout for the booking widget embedded on other websites (public/embed.js). */
export default function EmbedLayout({ children }: LayoutProps<"/embed">) {
  return (
    <EmbedFrame>
      <main className="mx-auto w-full max-w-4xl px-4 py-6">
        {children}
        <p className="mt-8 text-center text-xs text-muted-foreground">
          Secure booking · No payment until service is complete
        </p>
      </main>
    </EmbedFrame>
  );
}
