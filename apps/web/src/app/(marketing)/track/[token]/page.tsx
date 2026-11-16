import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TrackingLive } from "@/components/tracking/tracking-live";
import { getTrackingView } from "@/modules/tracking/service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Track your cleaner",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function TrackPage({ params }: PageProps<"/track/[token]">) {
  const { token } = await params;
  const view = await getTrackingView(token);
  if (!view) notFound();
  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <TrackingLive token={token} initial={view} />
    </div>
  );
}
