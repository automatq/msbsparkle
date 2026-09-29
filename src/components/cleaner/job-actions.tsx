"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  checkInAction,
  checkOutAction,
  enRouteAction,
  respondToOfferAction,
  toggleChecklistAction,
  uploadPhotoAction,
  type CleanerActionResult,
} from "@/modules/cleaner/actions";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<CleanerActionResult>) =>
    start(async () => {
      const res = await fn();
      if (res.ok) {
        if (res.message) toast.success(res.message);
        res.warnings?.forEach((w) => toast.warning(w));
        router.refresh();
      } else toast.error(res.message);
    });
  return { run, pending };
}

async function position(): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { timeout: 5000, maximumAge: 60_000 },
    );
  });
}

export function OfferButtons({ jobId }: { jobId: string }) {
  const { run, pending } = useRun();
  return (
    <div className="flex gap-2">
      <Button
        className="flex-1"
        disabled={pending}
        onClick={() => run(() => respondToOfferAction(jobId, true))}
        data-testid="accept"
      >
        Accept
      </Button>
      <Button
        className="flex-1"
        variant="outline"
        disabled={pending}
        onClick={() => {
          if (window.confirm("Decline this job?")) run(() => respondToOfferAction(jobId, false));
        }}
      >
        Decline
      </Button>
    </div>
  );
}

export function ProgressButtons({
  jobId,
  status,
  checkedIn,
  checkedOut,
}: {
  jobId: string;
  status: string;
  checkedIn: boolean;
  checkedOut: boolean;
}) {
  const { run, pending } = useRun();
  if (checkedOut)
    return (
      <p className="rounded-lg bg-emerald-50 p-3 text-center text-sm text-emerald-800">
        You&apos;re checked out of this job.
      </p>
    );
  if (!checkedIn) {
    return (
      <div className="flex gap-2">
        {status === "ASSIGNED" ? (
          <Button
            variant="outline"
            className="flex-1"
            disabled={pending}
            onClick={() => run(() => enRouteAction(jobId))}
          >
            On my way
          </Button>
        ) : null}
        <Button
          className="flex-1"
          size="lg"
          disabled={pending}
          onClick={() => run(async () => checkInAction(jobId, await position()))}
          data-testid="check-in"
        >
          {pending ? "…" : "Check in"}
        </Button>
      </div>
    );
  }
  return (
    <Button
      className="w-full"
      size="lg"
      disabled={pending}
      onClick={() => run(async () => checkOutAction(jobId, await position()))}
      data-testid="check-out"
    >
      {pending ? "…" : "Check out & complete"}
    </Button>
  );
}

export function Checklist({
  jobId,
  items,
  editable,
}: {
  jobId: string;
  items: { id: string; section: string; label: string; done: boolean; requiresPhoto: boolean }[];
  editable: boolean;
}) {
  const { run } = useRun();
  const [local, setLocal] = useState(items);
  const sections = [...new Set(local.map((i) => i.section))];
  const done = local.filter((i) => i.done).length;
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {done}/{local.length} done
      </p>
      {sections.map((s) => (
        <div key={s}>
          <p className="mb-1 text-sm font-medium">{s}</p>
          <ul className="space-y-1">
            {local
              .filter((i) => i.section === s)
              .map((i) => (
                <li key={i.id}>
                  <label
                    className={`flex items-center gap-3 rounded-lg border p-3 text-sm ${i.done ? "bg-muted/40 line-through" : ""}`}
                  >
                    <input
                      type="checkbox"
                      className="size-5"
                      checked={i.done}
                      disabled={!editable}
                      onChange={(e) => {
                        const next = e.target.checked;
                        setLocal((l) => l.map((x) => (x.id === i.id ? { ...x, done: next } : x)));
                        run(() => toggleChecklistAction(jobId, i.id, next));
                      }}
                      data-testid={`check-${i.id}`}
                    />
                    <span>
                      {i.label}
                      {i.requiresPhoto ? (
                        <span className="ml-1 text-xs text-amber-700">photo</span>
                      ) : null}
                    </span>
                  </label>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function PhotoUpload({
  jobId,
  kind,
}: {
  jobId: string;
  kind: "BEFORE" | "AFTER" | "ISSUE";
}) {
  const { run, pending } = useRun();
  const ref = useRef<HTMLInputElement>(null);
  return (
    <label
      className={`flex cursor-pointer items-center justify-center rounded-lg border border-dashed p-3 text-sm ${pending ? "opacity-50" : ""}`}
    >
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        disabled={pending}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const fd = new FormData();
          fd.set("file", f);
          run(() => uploadPhotoAction(jobId, kind, fd));
          if (ref.current) ref.current.value = "";
        }}
        data-testid={`photo-${kind}`}
      />
      + {kind === "BEFORE" ? "Before" : kind === "AFTER" ? "After" : "Issue"} photo
    </label>
  );
}
