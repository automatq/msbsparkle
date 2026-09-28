import type { Metadata } from "next";
import { orgSettings } from "@/modules/marketing/content";
import { prisma } from "@/modules/db/client";
export const metadata: Metadata = { title: "Contact" };
export default async function ContactPage() {
  const [org, regions] = await Promise.all([
    orgSettings(),
    prisma.region.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } }),
  ]);
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 space-y-6">
      <h1 className="text-4xl font-semibold tracking-tight">Contact us</h1>
      <p className="text-muted-foreground">
        Support 7 days a week.{" "}
        {org.supportPhone ? (
          <>
            Call{" "}
            <a className="underline" href={`tel:${org.supportPhone}`}>
              {org.supportPhone}
            </a>{" "}
            or{" "}
          </>
        ) : null}
        email{" "}
        <a className="underline" href={`mailto:${org.supportEmail}`}>
          {org.supportEmail}
        </a>
        .
      </p>
      <ul className="grid gap-2 text-sm sm:grid-cols-2">
        {regions.map((r) => (
          <li key={r.id} className="rounded-xl border p-3">
            <p className="font-medium">
              {r.name}, {r.province}
            </p>
            <p className="text-muted-foreground">
              {r.phone} · {r.email}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
