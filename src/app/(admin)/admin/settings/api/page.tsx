import { ApiAccessSettings } from "@/components/admin/api-access-settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/modules/auth/session";
import { prisma } from "@/modules/db/client";

export const dynamic = "force-dynamic";

export default async function ApiAccessPage() {
  const ctx = await requireRole("/admin/login", "SUPER_ADMIN");
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: ctx.orgId },
    select: { apiKeyHash: true, allowedOrigin: true },
  });
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Public API</h1>
        <p className="text-sm text-muted-foreground">
          Credentials for an external frontend calling this app&apos;s /api/v1/* endpoints.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>API access</CardTitle>
        </CardHeader>
        <CardContent>
          <ApiAccessSettings hasKey={!!org.apiKeyHash} allowedOrigin={org.allowedOrigin} />
        </CardContent>
      </Card>
    </div>
  );
}
