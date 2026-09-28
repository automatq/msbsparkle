import { ApplicationStatus } from "@/components/admin/marketing-panels";
import { StatusBadge } from "@/components/admin/ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireRole } from "@/modules/auth/session";
import { prisma } from "@/modules/db/client";

export const dynamic = "force-dynamic";

export default async function ApplicationsPage() {
  const ctx = await requireRole("/admin/login", "SUPER_ADMIN", "REGION_ADMIN");
  const apps = await prisma.cleanerApplication.findMany({
    where: {
      organizationId: ctx.orgId,
      ...(ctx.isSuperAdmin
        ? {}
        : { OR: [{ regionId: { in: ctx.regionIds } }, { regionId: null }] }),
    },
    include: { region: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Cleaner applications</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Applied</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>City / region</TableHead>
            <TableHead>Experience</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Update</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {apps.map((a) => (
            <TableRow key={a.id}>
              <TableCell>{a.createdAt.toLocaleDateString("en-CA")}</TableCell>
              <TableCell className="font-medium">
                {a.firstName} {a.lastName}
              </TableCell>
              <TableCell className="text-xs">
                {a.email}
                <br />
                {a.phone}
                {a.hasVehicle ? " · vehicle" : ""}
              </TableCell>
              <TableCell>
                {a.city}
                {a.region ? ` (${a.region.name})` : ""}
              </TableCell>
              <TableCell className="max-w-xs text-xs text-muted-foreground">
                {a.experience}
                {a.notes ? <div className="mt-1 text-foreground">Note: {a.notes}</div> : null}
              </TableCell>
              <TableCell>
                <StatusBadge
                  status={
                    a.status === "NEW"
                      ? "PENDING"
                      : a.status === "HIRED"
                        ? "ACTIVE"
                        : a.status === "REJECTED"
                          ? "CANCELLED"
                          : "CONFIRMED"
                  }
                />{" "}
                <span className="text-xs">{a.status}</span>
              </TableCell>
              <TableCell>
                <ApplicationStatus id={a.id} status={a.status} />
              </TableCell>
            </TableRow>
          ))}
          {apps.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                No applications yet.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
