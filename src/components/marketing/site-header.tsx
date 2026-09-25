import Link from "next/link";
import { Button } from "@/components/ui/button";

const brand = process.env.NEXT_PUBLIC_BRAND_NAME ?? "MSB Sparkle";

export function SiteHeader() {
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          {brand}
        </Link>
        <nav className="hidden items-center gap-6 text-sm md:flex">
          <Link href="/services">Services</Link>
          <Link href="/locations">Locations</Link>
          <Link href="/reviews">Reviews</Link>
          <Link href="/careers">Careers</Link>
          <Link href="/login" className="text-muted-foreground">
            Customer login
          </Link>
        </nav>
        <Button render={<Link href="/book" />}>Book online</Button>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t bg-muted/40">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 text-sm text-muted-foreground md:grid-cols-3">
        <div>
          <p className="font-medium text-foreground">{brand}</p>
          <p>Background-checked, insured and bonded cleaners across Canada.</p>
        </div>
        <div className="flex flex-col gap-1">
          <Link href="/services">Services</Link>
          <Link href="/locations">Locations</Link>
          <Link href="/gift-cards">Gift cards</Link>
          <Link href="/careers">Careers</Link>
        </div>
        <div className="flex flex-col gap-1">
          <Link href="/faq">FAQ</Link>
          <Link href="/guarantee">100% happiness guarantee</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </div>
      </div>
    </footer>
  );
}
