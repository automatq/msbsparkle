import { ChecklistsPanel } from "@/components/admin/mantine/catalog-panels";
import { requireRole } from "@/modules/auth/session";
import { listChecklists } from "@/modules/catalog/catalog";

export const dynamic = "force-dynamic";

export default async function CatalogChecklistsPage() {
  const ctx = await requireRole("/admin/login", "SUPER_ADMIN");
  return <ChecklistsPanel checklists={await listChecklists(ctx)} />;
}
