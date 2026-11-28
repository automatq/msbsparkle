import type { Metadata } from "next";
import { PageIntro } from "@/components/marketing/page-intro";
import { orgSettings, publicReviews } from "@/modules/marketing/content";
import { serviceHue } from "@/modules/marketing/hues";

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
    <div className="mx-auto max-w-6xl px-6">
      <PageIntro title="Reviews">
        Rated {org.googleRating} on Google
        {org.googleReviewCount ? ` from ${org.googleReviewCount} reviews` : ""}.
        {avg ? ` ${avg} average from ${reviews.length} recent in-app ratings.` : ""}
      </PageIntro>
      <ul className="mt-12 grid gap-x-10 md:grid-cols-2">
        {reviews.map((r) => (
          <li
            key={r.id}
            data-hue={serviceHue(r.job.service.slug)}
            className="border-t border-foreground py-6"
          >
            <p className="tracking-[0.2em]" aria-label={`${r.rating} out of 5`}>
              {"★".repeat(r.rating)}
              <span className="text-muted-foreground/40">{"★".repeat(5 - r.rating)}</span>
            </p>
            {r.comment ? <p className="mt-3 text-lg">{r.comment}</p> : null}
            <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <span className="size-2.5 shrink-0 rounded-full bg-hue" aria-hidden />
              {r.customer.firstName} {r.customer.lastName[0]}. · {r.job.region.name} ·{" "}
              {r.job.service.name}
              {r.cleaner ? ` with ${r.cleaner.firstName}` : ""}
            </p>
          </li>
        ))}
        {reviews.length === 0 ? (
          <li className="border-t border-foreground py-6 text-muted-foreground">
            Ratings from completed cleans appear here.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
