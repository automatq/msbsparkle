import { Stack } from "@mantine/core";
import { PageHeader } from "@/components/admin/mantine/page-header";
import { TeamPanel } from "@/components/admin/mantine/team-panel";
import { listTeam } from "@/modules/auth/admin-users";
import { requireRole } from "@/modules/auth/session";
import { prisma } from "@/modules/db/client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Team" };

/** Who can sign in to the admin, and what they can see. Super admins only. */
export default async function TeamPage() {
  const ctx = await requireRole("/admin/login", "SUPER_ADMIN");
  const [members, regions] = await Promise.all([
    listTeam(ctx),
    prisma.region.findMany({
      where: { organizationId: ctx.orgId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return (
    <Stack gap="lg">
      <PageHeader
        title="Team"
        description="People who can sign in to this admin. New members get an email with a link to choose their own password."
      />
      <TeamPanel members={members} regions={regions} />
    </Stack>
  );
}
