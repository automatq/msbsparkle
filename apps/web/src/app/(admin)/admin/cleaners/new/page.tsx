import { CleanerForm } from "@/components/admin/cleaner-form";
import { visibleRegions } from "@/modules/admin/regions";
import { requireRole } from "@/modules/auth/session";

export const dynamic = "force-dynamic";

export default async function NewCleanerPage() {
  const ctx = await requireRole("/admin/login", "SUPER_ADMIN", "REGION_ADMIN");
  const regions = await visibleRegions(ctx);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Add cleaner</h1>
      <CleanerForm
        regions={regions}
        initial={{
          firstName: "",
          lastName: "",
          email: "",
          phone: "",
          homeRegionId: regions[0]?.id ?? "",
          regionIds: [],
          status: "ONBOARDING",
          backgroundCheckStatus: "PENDING",
          payType: "PERCENT_OF_JOB",
          payRateCents: null,
          payPercentBps: 6000,
          maxJobsPerDay: 3,
          skills: [],
          notes: "",
          availability: [1, 2, 3, 4, 5].map((weekday) => ({
            weekday,
            startLocal: "08:00",
            endLocal: "17:00",
          })),
        }}
      />
    </div>
  );
}
