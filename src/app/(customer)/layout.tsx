import Link from "next/link";
import { requireRole } from "@/modules/auth/session";
import { signOut } from "@/modules/auth/config";
import { Button } from "@/components/ui/button";

export default async function CustomerLayout({ children }: LayoutProps<"/">) {
  const ctx = await requireRole("/login");

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <header className="mb-8 flex items-center justify-between">
        <nav className="flex gap-4 text-sm">
          <Link href="/account">Bookings</Link>
          <Link href="/account/payment">Payment</Link>
          <Link href="/account/settings">Settings</Link>
        </nav>
        <form action={logout} className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{ctx.email}</span>
          <Button variant="outline" size="sm" type="submit">
            Sign out
          </Button>
        </form>
      </header>
      {children}
    </div>
  );
}
