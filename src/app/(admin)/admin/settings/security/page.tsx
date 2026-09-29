import { TotpSetup } from "@/components/admin/totp-setup";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/modules/auth/session";
import { prisma } from "@/modules/db/client";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const ctx = await requireRole("/admin/login", "SUPER_ADMIN", "REGION_ADMIN");
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: ctx.userId },
    select: { email: true, totpEnabled: true },
  });
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Security</h1>
        <p className="text-sm text-muted-foreground">Signed in as {user.email}.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Two-factor authentication</CardTitle>
        </CardHeader>
        <CardContent>
          <TotpSetup enabled={user.totpEnabled} />
        </CardContent>
      </Card>
    </div>
  );
}
