import Link from "next/link";
import { requireRole } from "@/modules/auth/session";

export default async function CleanerLayout({ children }: LayoutProps<"/">) {
  await requireRole("/login", "CLEANER", "SUPER_ADMIN");
  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 p-4 pb-20">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 grid grid-cols-3 border-t bg-background text-center text-xs">
        <Link href="/cleaner" className="py-3">
          Today
        </Link>
        <Link href="/cleaner/earnings" className="py-3">
          Earnings
        </Link>
        <Link href="/cleaner/availability" className="py-3">
          Availability
        </Link>
      </nav>
    </div>
  );
}
