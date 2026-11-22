import { Paper, Stack, Title } from "@mantine/core";
import { PageHeader } from "@/components/admin/mantine/page-header";
import { TotpSetup } from "@/components/admin/mantine/totp-setup";
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
    <Stack gap="lg" maw={720}>
      <PageHeader title="Security" description={`Signed in as ${user.email}.`} />
      <Paper p="md">
        <Title order={2} fz="md" fw={600} mb="sm">
          Two-factor authentication
        </Title>
        <TotpSetup enabled={user.totpEnabled} />
      </Paper>
    </Stack>
  );
}
