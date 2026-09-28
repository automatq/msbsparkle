import type { Metadata } from "next";
import { orgSettings, publicReviews } from "@/modules/marketing/content";

export const revalidate = 1800;
export const metadata: Metadata = {
  title: "Reviews",
  description: "What customers say about their cleans.",
};

export default async function ReviewsPage() {
  const [org, reviews] = await Promise.all([orgSettings(), publicReviews(undefined, 60)]);
  const avg = reviews.length
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : null;
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-4xl font-semibold tracking-tight">Reviews</h1>
      <p className="mt-2 text-muted-foreground">
        Rated {org.googleRating} on Google
        {org.googleReviewCount ? ` from ${org.googleReviewCount} reviews` : ""}.
        {avg ? ` ${avg} average from ${reviews.length} recent in-app ratings.` : ""}
      </p>
      <ul className="mt-8 grid gap-3 md:grid-cols-3">
        {reviews.map((r) => (
          <li key={r.id} className="rounded-xl border p-4 text-sm">
            <p className="text-amber-500">{"★".repeat(r.rating)}</p>
            {r.comment ? <p className="mt-1">{r.comment}</p> : null}
            <p className="mt-2 text-xs text-muted-foreground">
              {r.customer.firstName} {r.customer.lastName[0]}. · {r.job.region.name} ·{" "}
              {r.job.service.name}
              {r.cleaner ? ` with ${r.cleaner.firstName}` : ""}
            </p>
          </li>
        ))}
        {reviews.length === 0 ? (
          <li className="text-sm text-muted-foreground">
            Ratings from completed cleans appear here.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
