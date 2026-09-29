import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/admin/ui";
import {
  Checklist,
  OfferButtons,
  PhotoUpload,
  ProgressButtons,
} from "@/components/cleaner/job-actions";
import { requireRole } from "@/modules/auth/session";
import { cleanerForUser } from "@/modules/cleaner/queries";
import { prisma } from "@/modules/db/client";
import { formatInZone } from "@/modules/shared/dates";

export const dynamic = "force-dynamic";

export default async function CleanerJobPage({ params }: PageProps<"/cleaner/jobs/[id]">) {
  const ctx = await requireRole("/login/phone", "CLEANER", "SUPER_ADMIN");
  const cleaner = await cleanerForUser(ctx.userId);
  if (!cleaner) notFound();
  const { id } = await params;
  const a = await prisma.assignment.findUnique({
    where: { jobId_cleanerId: { jobId: id, cleanerId: cleaner.id } },
    include: {
      job: {
        include: {
          customer: true,
          service: true,
          booking: true,
          checklist: { orderBy: { sortOrder: "asc" } },
          photos: { orderBy: { takenAt: "asc" } },
          assignments: { where: { status: "ACCEPTED" }, include: { cleaner: true } },
        },
      },
    },
  });
  if (!a || !["OFFERED", "ACCEPTED"].includes(a.status)) notFound();
  const job = a.job;
  const addr = job.addressSnapshot as {
    line1: string;
    line2?: string | null;
    city: string;
    postalCode: string;
    entryInstructions?: string | null;
    parkingInstructions?: string | null;
  };
  const mapsQ = encodeURIComponent(`${addr.line1}, ${addr.city} ${addr.postalCode}`);
  const extras = job.extras as { slug: string; qty: number }[];
  const teammates = job.assignments.filter((x) => x.cleanerId !== cleaner.id);
  const active =
    a.status === "ACCEPTED" &&
    !["COMPLETED", "CANCELLED", "SKIPPED", "NO_SHOW"].includes(job.status);

  return (
    <div className="space-y-5">
      <div>
        <Link href="/cleaner" className="text-xs text-muted-foreground">
          ← Today
        </Link>
        <h1 className="text-lg font-semibold">
          {formatInZone(job.scheduledStartAt, job.timezone, "EEEE, MMM d")} · {job.windowStartLocal}
          –{job.windowEndLocal}
        </h1>
        <div className="mt-1 flex items-center gap-2">
          <StatusBadge status={job.status} />
          <span className="text-xs text-muted-foreground">
            {job.booking.bookingNumber} · ~{Math.round((job.estimatedMinutes / 60) * 10) / 10}h
            {teammates.length
              ? ` · with ${teammates.map((t) => t.cleaner.firstName).join(", ")}`
              : ""}
          </span>
        </div>
      </div>

      {a.status === "OFFERED" ? <OfferButtons jobId={job.id} /> : null}
      {active ? (
        <ProgressButtons
          jobId={job.id}
          status={job.status}
          checkedIn={!!a.checkInAt}
          checkedOut={!!a.checkOutAt}
        />
      ) : null}
      {job.status === "COMPLETED" ? (
        <p className="rounded-lg bg-emerald-50 p-3 text-center text-sm text-emerald-800">
          Completed{" "}
          {job.completedAt ? formatInZone(job.completedAt, job.timezone, "MMM d, h:mm a") : ""}
        </p>
      ) : null}

      <section className="rounded-xl border p-3 text-sm">
        <p className="font-medium">
          {addr.line1}
          {addr.line2 ? `, ${addr.line2}` : ""}
        </p>
        <p className="text-muted-foreground">
          {addr.city} {addr.postalCode}
        </p>
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${mapsQ}`}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-block text-primary underline"
        >
          Open in Maps
        </a>
        {addr.entryInstructions ? (
          <p className="mt-2">
            <span className="text-xs text-muted-foreground">Entry: </span>
            {addr.entryInstructions}
          </p>
        ) : null}
        {addr.parkingInstructions ? (
          <p>
            <span className="text-xs text-muted-foreground">Parking: </span>
            {addr.parkingInstructions}
          </p>
        ) : null}
        {job.customerNotes ? (
          <p className="mt-2">
            <span className="text-xs text-muted-foreground">Customer: </span>
            {job.customerNotes}
          </p>
        ) : null}
        {job.internalNotes ? (
          <p className="mt-1">
            <span className="text-xs text-muted-foreground">Dispatch: </span>
            {job.internalNotes}
          </p>
        ) : null}
        {a.status === "ACCEPTED" ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {job.customer.firstName} {job.customer.lastName} ·{" "}
            <a href={`tel:${job.customer.phone}`} className="underline">
              {job.customer.phone}
            </a>
          </p>
        ) : null}
      </section>

      <section className="rounded-xl border p-3 text-sm">
        <p className="font-medium">
          {job.service.name}
          {job.isFirstCleanUpgrade ? " · first-clean upgrade" : ""}
        </p>
        <p className="text-muted-foreground">
          {job.bedrooms} bed · {job.bathrooms.toString()} bath
          {job.sqft ? ` · ${job.sqft} sq ft` : ""}
        </p>
        {extras.length ? (
          <p className="text-muted-foreground">
            Extras:{" "}
            {extras
              .map((e) => `${e.slug.replaceAll("-", " ")}${e.qty > 1 ? ` ×${e.qty}` : ""}`)
              .join(", ")}
          </p>
        ) : null}
      </section>

      {job.checklist.length ? (
        <section className="rounded-xl border p-3">
          <h2 className="mb-2 font-medium">Checklist</h2>
          <Checklist
            jobId={job.id}
            editable={active && !!a.checkInAt && !a.checkOutAt}
            items={job.checklist.map((i) => ({
              id: i.id,
              section: i.section,
              label: i.label,
              done: !!i.completedAt,
              requiresPhoto: i.requiresPhoto,
            }))}
          />
        </section>
      ) : null}

      {a.status === "ACCEPTED" ? (
        <section className="rounded-xl border p-3">
          <h2 className="mb-2 font-medium">Photos</h2>
          {job.photos.length ? (
            <div className="mb-3 grid grid-cols-3 gap-2">
              {job.photos.map((p) => (
                <a key={p.id} href={p.url} target="_blank" rel="noreferrer">
                  <Image
                    src={p.url}
                    alt={p.kind}
                    width={300}
                    height={300}
                    unoptimized
                    className="aspect-square w-full rounded-lg object-cover"
                  />
                  <span className="text-xs text-muted-foreground">{p.kind.toLowerCase()}</span>
                </a>
              ))}
            </div>
          ) : null}
          {active && !a.checkOutAt ? (
            <div className="grid grid-cols-3 gap-2">
              <PhotoUpload jobId={job.id} kind="BEFORE" />
              <PhotoUpload jobId={job.id} kind="AFTER" />
              <PhotoUpload jobId={job.id} kind="ISSUE" />
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
