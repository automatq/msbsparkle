import Link from "next/link";
import { cn } from "cn";
import { country } from "@/modules/shared/country";
import { brandName } from "@/modules/shared/site";

const brand = brandName;

/** Three rooms in three services' colours: the mark beside the name. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex h-5 items-stretch gap-0.5", className)} aria-hidden>
      <span data-hue="lagoon" className="w-1.5 rounded-[3px] bg-hue" />
      <span data-hue="cobalt" className="w-1.5 rounded-[3px] bg-hue" />
      <span data-hue="marigold" className="w-1.5 rounded-[3px] bg-hue" />
    </span>
  );
}

export function Brand({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("inline-flex items-center gap-2.5", className)}>
      <BrandMark />
      <span className="wide text-lg font-semibold">{brand}</span>
    </Link>
  );
}

/** The top of a public page: only the name. Everything else is in the bar at the bottom. */
export function SiteHeader() {
  return (
    <header className="mx-auto flex h-20 w-full max-w-6xl items-center justify-between px-6">
      <Brand />
      <Link
        href="/login"
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        Customer login
      </Link>
    </header>
  );
}

const COLUMNS = [
  [
    { href: "/services", label: "Services" },
    { href: "/locations", label: "Locations" },
    { href: "/reviews", label: "Reviews" },
    { href: "/gift-cards", label: "Gift cards" },
  ],
  [
    { href: "/faq", label: "Questions" },
    { href: "/guarantee", label: "Happiness guarantee" },
    { href: "/contact", label: "Contact" },
    { href: "/careers", label: "Clean with us" },
  ],
  [
    { href: "/login", label: "Customer login" },
    { href: "/login/phone", label: "Cleaner login" },
    { href: "/privacy", label: "Privacy" },
    { href: "/terms", label: "Terms" },
  ],
];

export function SiteFooter() {
  return (
    // The bottom padding keeps the last line clear of the bar.
    <footer className="mx-auto mt-auto w-full max-w-6xl px-6 pt-24 pb-32">
      <div className="grid gap-10 border-t border-foreground pt-8 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="space-y-2">
          <p className="wide text-xl font-semibold">{brand}</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            Background-checked, insured and bonded cleaners across {country.name}.
          </p>
        </div>
        {COLUMNS.map((col, i) => (
          <ul key={i} className="space-y-2 text-sm">
            {col.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        ))}
      </div>
    </footer>
  );
}
