import "@mantine/core/styles.layer.css";
import "@mantine/dates/styles.layer.css";
import { colorSchemeScript } from "@/components/admin/mantine/color-scheme-script";
import { AdminMantineProvider } from "@/components/admin/mantine/provider";
import { AdminShell } from "@/components/admin/mantine/shell";
import { signOut } from "@/modules/auth/config";
import { requireRole } from "@/modules/auth/session";
import { brandName } from "@/modules/shared/site";

export default async function AdminLayout({ children }: LayoutProps<"/">) {
  const ctx = await requireRole("/admin/login", "SUPER_ADMIN", "REGION_ADMIN");

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/admin/login" });
  }

  return (
    <>
      {/* Applies the saved light/dark choice before paint (see color-scheme-script.ts). */}
      <script dangerouslySetInnerHTML={{ __html: colorSchemeScript }} />
      <AdminMantineProvider>
        <AdminShell
          brand={brandName}
          email={ctx.email}
          scopeLabel={ctx.isSuperAdmin ? "All regions" : `${ctx.regionIds.length} region(s)`}
          isSuperAdmin={ctx.isSuperAdmin}
          logout={logout}
        >
          {children}
        </AdminShell>
      </AdminMantineProvider>
    </>
  );
}
