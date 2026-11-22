import { ServicesPanel } from "@/components/admin/mantine/catalog-panels";
import { requireRole } from "@/modules/auth/session";
import { listChecklists, listServices } from "@/modules/catalog/catalog";

export const dynamic = "force-dynamic";

export default async function CatalogServicesPage() {
  const ctx = await requireRole("/admin/login", "SUPER_ADMIN");
  const [services, checklists] = await Promise.all([listServices(ctx), listChecklists(ctx)]);
  return (
    <ServicesPanel
      services={services}
      checklists={checklists.map((c) => ({ id: c.id, name: c.name }))}
    />
  );
}
