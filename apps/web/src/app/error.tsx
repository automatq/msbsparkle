"use client";

import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String((error as { digest?: string }).digest ?? "")
      : "";
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">
        Sorry about that. Please try again. If it keeps happening, contact us and mention the
        reference below.
      </p>
      <div className="flex gap-2">
        <Button onClick={() => retry()}>Try again</Button>
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          Go home
        </Link>
      </div>
      {digest ? <p className="font-mono text-xs text-muted-foreground">Ref: {digest}</p> : null}
    </main>
  );
}
