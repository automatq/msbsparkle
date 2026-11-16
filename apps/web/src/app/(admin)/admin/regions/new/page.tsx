import Link from "next/link";
import { NewRegionForm } from "@/components/admin/area-tax-panels";
import { requireRole } from "@/modules/auth/session";
import { timezone } from "@/modules/shared/country";

export default async function NewRegionPage() {
  await requireRole("/admin/login", "SUPER_ADMIN");
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-muted-foreground">
          <Link href="/admin/regions" className="hover:underline">
            Regions
          </Link>
        </p>
        <h1 className="text-2xl font-semibold">New region</h1>
        <p className="text-sm text-muted-foreground">
          A region is an operating area with its own schedule, capacity and cleaners.
        </p>
      </div>
      <NewRegionForm defaultTimezone={timezone} />
    </div>
  );
}
