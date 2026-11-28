import type { Metadata } from "next";
import { PageIntro } from "@/components/marketing/page-intro";
import { prisma } from "@/modules/db/client";
import { orgSettings } from "@/modules/marketing/content";

export const metadata: Metadata = { title: "Contact" };

export default async function ContactPage() {
  const [org, regions] = await Promise.all([
    orgSettings(),
    prisma.region.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } }),
  ]);
  return (
    <div className="mx-auto max-w-6xl px-6">
      <PageIntro title="Contact us">
        Support 7 days a week.{" "}
        {org.supportPhone ? (
          <>
            Call{" "}
            <a
              className="text-foreground underline underline-offset-4"
              href={`tel:${org.supportPhone}`}
            >
              {org.supportPhone}
            </a>{" "}
            or{" "}
          </>
        ) : null}
        email{" "}
        <a
          className="text-foreground underline underline-offset-4"
          href={`mailto:${org.supportEmail}`}
        >
          {org.supportEmail}
        </a>
        .
      </PageIntro>
      <h2 className="mt-16 text-2xl font-semibold">Local teams</h2>
      <ul className="mt-5 border-t border-foreground">
        {regions.map((r) => (
          <li
            key={r.id}
            className="grid gap-1 border-b py-4 sm:grid-cols-[1.2fr_1fr_1.4fr] sm:items-baseline"
          >
            <p className="font-semibold">
              {r.name}, {r.province}
            </p>
            {r.phone ? (
              <a
                href={`tel:${r.phone.replace(/\s/g, "")}`}
                className="narrow text-muted-foreground hover:text-foreground"
              >
                {r.phone}
              </a>
            ) : (
              <span />
            )}
            {r.email ? (
              <a href={`mailto:${r.email}`} className="text-muted-foreground hover:text-foreground">
                {r.email}
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
