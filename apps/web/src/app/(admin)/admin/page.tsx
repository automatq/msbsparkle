import { Group, Paper, SimpleGrid, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import {
  CalendarCheck,
  ClipboardList,
  CreditCard,
  MapPin,
  TriangleAlert,
  UserPlus,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/admin/mantine/page-header";
import { requireRole } from "@/modules/auth/session";
import { prisma } from "@/modules/db/client";
import { regionWhere } from "@/modules/db/scoped";
import { timezone } from "@/modules/shared/country";
import { addLocalDays, localDateToDateColumn, todayIn } from "@/modules/shared/dates";

export const dynamic = "force-dynamic";

function Stat({ label, value, icon: Icon }: { label: string; value: number; icon: LucideIcon }) {
  return (
    <Paper p="md">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div>
          <Text size="sm" c="dimmed">
            {label}
          </Text>
          <Text fz={28} fw={600} lh={1.2} mt={4}>
            {value.toLocaleString()}
          </Text>
        </div>
        <ThemeIcon variant="light" color="gray" size="lg" radius="md">
          <Icon size={18} strokeWidth={1.75} />
        </ThemeIcon>
      </Group>
    </Paper>
  );
}

function Attention({
  href,
  count,
  title,
  hint,
  icon: Icon,
  testId,
}: {
  href: string;
  count: number;
  title: string;
  hint: string;
  icon: LucideIcon;
  testId: string;
}) {
  const urgent = count > 0;
  return (
    <Link
      href={href}
      className="block rounded-[var(--radius)] transition hover:shadow-sm"
      data-testid={testId}
    >
      <Paper p="md" h="100%" bg={urgent ? "var(--mantine-color-orange-light)" : undefined}>
        <Group gap="sm" wrap="nowrap" align="flex-start">
          <ThemeIcon variant="light" color={urgent ? "orange" : "teal"} size="lg" radius="md">
            <Icon size={18} strokeWidth={1.75} />
          </ThemeIcon>
          <div>
            <Text fw={600}>
              {count} {title}
            </Text>
            <Text size="sm" c="dimmed">
              {urgent ? hint : "All clear"}
            </Text>
          </div>
        </Group>
      </Paper>
    </Link>
  );
}

export default async function AdminDashboard() {
  const ctx = await requireRole("/admin/login", "SUPER_ADMIN", "REGION_ADMIN");
  const scope = regionWhere(ctx);
  const today = todayIn(timezone);
  const in7 = addLocalDays(today, 7);
  const in14 = addLocalDays(today, 14);
  const day = (d: string) => localDateToDateColumn(d);

  const [regions, cleaners, customers, todays, upcoming, unassigned, unpaid, applicants] =
    await Promise.all([
      prisma.region.count({ where: ctx.isSuperAdmin ? {} : { id: { in: ctx.regionIds } } }),
      prisma.cleaner.count({
        where: {
          status: "ACTIVE",
          ...(ctx.isSuperAdmin ? {} : { homeRegionId: { in: ctx.regionIds } }),
        },
      }),
      prisma.customer.count({ where: ctx.isSuperAdmin ? {} : { bookings: { some: scope } } }),
      prisma.job.count({
        where: {
          ...scope,
          scheduledDate: day(today),
          status: { notIn: ["CANCELLED", "SKIPPED"] },
        },
      }),
      prisma.job.count({
        where: {
          ...scope,
          scheduledDate: { gte: day(today), lte: day(in14) },
          status: { in: ["PENDING", "CONFIRMED", "ASSIGNED"] },
        },
      }),
      prisma.job.count({
        where: {
          ...scope,
          scheduledDate: { gte: day(today), lte: day(in7) },
          status: { in: ["PENDING", "CONFIRMED"] },
        },
      }),
      prisma.job.count({
        where: { ...scope, status: "COMPLETED", paymentStatus: { in: ["UNPAID", "FAILED"] } },
      }),
      prisma.cleanerApplication.count({
        where: { status: "NEW", ...(ctx.isSuperAdmin ? {} : { regionId: { in: ctx.regionIds } }) },
      }),
    ]);

  return (
    <Stack gap="xl">
      <PageHeader
        title="Dashboard"
        description={ctx.isSuperAdmin ? "All regions" : `${ctx.regionIds.length} region(s)`}
      />

      <Stack gap="sm">
        <Title order={2} fz="md" fw={600}>
          Needs attention
        </Title>
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <Attention
            href={`/admin/jobs?status=CONFIRMED&from=${today}&to=${in7}`}
            count={unassigned}
            title="unassigned in the next 7 days"
            hint="Assign a cleaner before the visit."
            icon={TriangleAlert}
            testId="attention-unassigned"
          />
          <Attention
            href="/admin/payments"
            count={unpaid}
            title="completed visits not paid"
            hint="Charge failed or not attempted yet."
            icon={CreditCard}
            testId="attention-unpaid"
          />
          <Attention
            href="/admin/applications"
            count={applicants}
            title="new applicants"
            hint="Review and reply."
            icon={UserPlus}
            testId="attention-applicants"
          />
        </SimpleGrid>
      </Stack>

      <SimpleGrid cols={{ base: 1, xs: 2, lg: 5 }}>
        <Stat label="Visits today" value={todays} icon={CalendarCheck} />
        <Stat label="Upcoming (14 days)" value={upcoming} icon={ClipboardList} />
        <Stat label="Customers" value={customers} icon={Users} />
        <Stat label="Active cleaners" value={cleaners} icon={UsersRound} />
        <Stat label="Regions" value={regions} icon={MapPin} />
      </SimpleGrid>
    </Stack>
  );
}
