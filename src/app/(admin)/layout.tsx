import Link from "next/link";
import { requireRole } from "@/modules/auth/session";
import { signOut } from "@/modules/auth/config";
import { Button } from "@/components/ui/button";

const NAV = [
  ["/admin", "Dashboard"],
  ["/admin/calendar", "Calendar"],
  ["/admin/jobs", "Jobs"],
  ["/admin/bookings", "Bookings"],
  ["/admin/customers", "Customers"],
  ["/admin/cleaners", "Cleaners"],
  ["/admin/regions", "Regions"],
  ["/admin/payments", "Payments"],
  ["/admin/reports", "Reports"],
] as const;

export default async function AdminLayout({ children }: LayoutProps<"/">) {
  const ctx = await requireRole("/admin/login", "SUPER_ADMIN", "REGION_ADMIN");

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/admin/login" });
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 flex-col border-r bg-muted/30 p-4 md:flex">
        <p className="mb-6 font-semibold">Admin</p>
        <nav className="flex flex-col gap-1 text-sm">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} className="rounded px-2 py-1.5 hover:bg-muted">
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto space-y-2 text-xs text-muted-foreground">
          <p className="truncate">{ctx.email}</p>
          <p>{ctx.isSuperAdmin ? "All regions" : `${ctx.regionIds.length} region(s)`}</p>
          <form action={logout}>
            <Button variant="outline" size="sm" type="submit">
              Sign out
            </Button>
          </form>
        </div>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
