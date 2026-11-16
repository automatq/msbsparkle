import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-sm text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist or has moved.
      </p>
      <div className="flex gap-2">
        <Link href="/" className={buttonVariants()}>
          Go home
        </Link>
        <Link href="/book" className={buttonVariants({ variant: "outline" })}>
          Book a clean
        </Link>
      </div>
    </main>
  );
}
