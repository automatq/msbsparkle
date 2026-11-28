"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

const LINKS = [
  { href: "/services", label: "Services", from: "flex" },
  { href: "/locations", label: "Locations", from: "hidden sm:flex" },
  { href: "/reviews", label: "Reviews", from: "hidden md:flex" },
  { href: "/faq", label: "Questions", from: "hidden md:flex" },
  { href: "/careers", label: "Careers", from: "hidden md:flex" },
];

/**
 * The bar along the bottom of every public page: it leads everywhere, and ends in the one thing
 * to do here, booking. Dark in both themes (--bar).
 */
export function SiteBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Site"
      className="fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-fit items-center gap-1 overflow-x-auto rounded-full bg-bar p-1.5 text-bar-foreground shadow-lift sm:bottom-5"
    >
      <Link
        href="/"
        aria-label="Home"
        className={cn(
          "flex h-11 shrink-0 items-center gap-0.5 rounded-full px-4",
          pathname === "/" && "bg-bar-raised",
        )}
      >
        <span data-hue="lagoon" className="h-4 w-1.5 rounded-[3px] bg-hue" />
        <span data-hue="cobalt" className="h-4 w-1.5 rounded-[3px] bg-hue" />
        <span data-hue="marigold" className="h-4 w-1.5 rounded-[3px] bg-hue" />
      </Link>
      {LINKS.map((l) => {
        const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "h-11 shrink-0 items-center rounded-full px-4 text-sm font-medium transition-colors",
              l.from,
              active
                ? "bg-bar-raised text-bar-foreground"
                : "text-bar-muted hover:text-bar-foreground",
            )}
          >
            {l.label}
          </Link>
        );
      })}
      <Link
        href="/book"
        className="ml-1 flex h-11 shrink-0 items-center gap-2 rounded-full bg-bar-foreground px-5 text-sm font-semibold text-bar transition-[opacity,transform] hover:opacity-90 active:scale-[0.97] motion-reduce:active:scale-100"
      >
        Book online
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </nav>
  );
}
