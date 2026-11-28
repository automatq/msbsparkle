import { ExtrasPanel } from "@/components/admin/mantine/catalog-panels";
import { requireRole } from "@/modules/auth/session";
import { listExtras } from "@/modules/catalog/catalog";

export const dynamic = "force-dynamic";

export default async function CatalogExtrasPage() {
  const ctx = await requireRole("/admin/login", "SUPER_ADMIN");
  return <ExtrasPanel extras={await listExtras(ctx)} />;
}
