import Link from "next/link";
import { Button } from "@/components/ui/button";
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
import { regionWhere } from "@/modules/db/scoped";

export const dynamic = "force-dynamic";

export default async function CustomersPage({ searchParams }: PageProps<"/admin/customers">) {
  const ctx = await requireRole("/admin/login", "SUPER_ADMIN", "REGION_ADMIN");
  const p = await searchParams;
  const q = typeof p.q === "string" ? p.q : "";
  const customers = await prisma.customer.findMany({
    where: {
      organizationId: ctx.orgId,
      ...(ctx.isSuperAdmin ? {} : { bookings: { some: regionWhere(ctx) } }),
      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { phone: { contains: q } },
            ],
          }
        : {}),
    },
    include: {
      _count: { select: { bookings: true, jobs: true } },
      addresses: { where: { isDefault: true }, take: 1, include: { region: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Customers</h1>
      <form className="flex gap-2 text-sm">
        <input
          name="q"
          defaultValue={q}
          placeholder="Name, email or phone"
          className="h-8 rounded-lg border px-2"
        />
        <Button type="submit" size="sm" variant="outline">
          Search
        </Button>
      </form>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Region</TableHead>
            <TableHead>Bookings</TableHead>
            <TableHead>Visits</TableHead>
            <TableHead>Since</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {customers.map((c) => (
            <TableRow key={c.id}>
              <TableCell>
                <Link href={`/admin/customers/${c.id}`} className="font-medium hover:underline">
                  {c.firstName} {c.lastName}
                </Link>
              </TableCell>
              <TableCell>{c.email}</TableCell>
              <TableCell>{c.phone}</TableCell>
              <TableCell>{c.addresses[0]?.region.name ?? "—"}</TableCell>
              <TableCell>{c._count.bookings}</TableCell>
              <TableCell>{c._count.jobs}</TableCell>
              <TableCell>{c.createdAt.toLocaleDateString("en-CA")}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
