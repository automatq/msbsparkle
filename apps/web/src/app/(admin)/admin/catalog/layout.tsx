import { Stack } from "@mantine/core";
import { CatalogTabs } from "@/components/admin/mantine/catalog-panels";
import { PageHeader } from "@/components/admin/mantine/page-header";
import { requireRole } from "@/modules/auth/session";

export const metadata = { title: "Catalog" };

/** Services, add-ons and checklists. Super admins only, like pricing. */
export default async function CatalogLayout({ children }: LayoutProps<"/admin/catalog">) {
  await requireRole("/admin/login", "SUPER_ADMIN");
  return (
    <Stack gap="lg">
      <PageHeader
        title="Catalog"
        description="The services and add-ons customers can book, and the checklists cleaners follow."
      />
      <CatalogTabs />
      {children}
    </Stack>
  );
}
