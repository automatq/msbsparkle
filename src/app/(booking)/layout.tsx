import Link from "next/link";

const brand = process.env.NEXT_PUBLIC_BRAND_NAME ?? "MSB Sparkle";

export default function BookingLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4 text-sm">
          <Link href="/" className="font-semibold">
            {brand}
          </Link>
          <span className="text-muted-foreground">
            Secure booking · No payment until service is complete
          </span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
