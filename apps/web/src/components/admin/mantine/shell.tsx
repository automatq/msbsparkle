"use client";

import {
  AppShell,
  Burger,
  Divider,
  Group,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  BadgePercent,
  ChartColumn,
  Briefcase,
  CalendarDays,
  CodeXml,
  CreditCard,
  LayoutDashboard,
  LogOut,
  MapPin,
  Receipt,
  ShieldCheck,
  Tags,
  UserPlus,
  Users,
  UsersRound,
  Webhook,
  KeyRound,
  type LucideIcon,
  ClipboardList,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";

type Item = { href: string; label: string; icon: LucideIcon; superAdmin?: boolean };

const NAV: { title: string; items: Item[] }[] = [
  {
    title: "Operations",
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
      { href: "/admin/calendar", label: "Calendar", icon: CalendarDays },
      { href: "/admin/jobs", label: "Jobs", icon: ClipboardList },
      { href: "/admin/bookings", label: "Bookings", icon: Briefcase },
      { href: "/admin/customers", label: "Customers", icon: Users },
      { href: "/admin/cleaners", label: "Cleaners", icon: UsersRound },
      { href: "/admin/applications", label: "Applicants", icon: UserPlus },
    ],
  },
  {
    title: "Business",
    items: [
      { href: "/admin/regions", label: "Regions", icon: MapPin },
      { href: "/admin/pricing", label: "Pricing", icon: Tags },
      { href: "/admin/taxes", label: "Taxes", icon: Receipt },
      { href: "/admin/payments", label: "Payments", icon: CreditCard },
      { href: "/admin/promos", label: "Promos", icon: BadgePercent },
      { href: "/admin/reports", label: "Reports", icon: ChartColumn },
    ],
  },
  {
    title: "Settings",
    items: [
      { href: "/admin/settings/embed", label: "Website widget", icon: CodeXml },
      { href: "/admin/settings/webhooks", label: "Webhooks", icon: Webhook, superAdmin: true },
      { href: "/admin/settings/api-keys", label: "API keys", icon: KeyRound, superAdmin: true },
      { href: "/admin/settings/security", label: "Security", icon: ShieldCheck },
    ],
  },
];

function isActive(pathname: string, href: string) {
  return href === "/admin"
    ? pathname === "/admin"
    : pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminShell({
  brand,
  email,
  scopeLabel,
  isSuperAdmin,
  logout,
  children,
}: {
  brand: string;
  email: string;
  scopeLabel: string;
  isSuperAdmin: boolean;
  logout: () => Promise<void>;
  children: ReactNode;
}) {
  const [opened, { toggle, close }] = useDisclosure();
  const pathname = usePathname();
  // Close the mobile menu after navigating.
  useEffect(close, [pathname, close]);

  return (
    <AppShell
      header={{ height: 56, collapsed: false }}
      navbar={{ width: 240, breakpoint: "md", collapsed: { mobile: !opened } }}
      padding="lg"
    >
      <AppShell.Header px="md">
        <Group h="100%" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger opened={opened} onClick={toggle} hiddenFrom="md" size="sm" aria-label="Menu" />
            <Text fw={600} truncate>
              {brand}
            </Text>
            <Text size="sm" c="dimmed" visibleFrom="xs">
              Admin
            </Text>
          </Group>
          <Text size="sm" c="dimmed" truncate visibleFrom="sm">
            {email}
          </Text>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm" aria-label="Admin">
        <AppShell.Section grow component={ScrollArea}>
          <Stack gap="sm">
            {NAV.map((group) => {
              const items = group.items.filter((i) => !i.superAdmin || isSuperAdmin);
              return (
                <div key={group.title}>
                  <Text size="xs" fw={600} c="dimmed" tt="uppercase" px="sm" mb={4}>
                    {group.title}
                  </Text>
                  {items.map(({ href, label, icon: Icon }) => (
                    <NavLink
                      key={href}
                      component={Link}
                      href={href}
                      label={label}
                      leftSection={<Icon size={16} strokeWidth={1.75} />}
                      active={isActive(pathname, href)}
                      variant="light"
                      color="gray"
                      py={6}
                      styles={{ label: { fontSize: "var(--mantine-font-size-sm)" } }}
                    />
                  ))}
                </div>
              );
            })}
          </Stack>
        </AppShell.Section>
        <AppShell.Section>
          <Divider my="sm" />
          <Text size="xs" c="dimmed" px="sm" truncate>
            {email}
          </Text>
          <Text size="xs" c="dimmed" px="sm" mb="xs">
            {scopeLabel}
          </Text>
          <form action={logout}>
            <UnstyledButton
              type="submit"
              w="100%"
              px="sm"
              py={6}
              style={{ borderRadius: "var(--mantine-radius-md)" }}
              className="hover:bg-muted"
            >
              <Group gap="xs">
                <LogOut size={16} strokeWidth={1.75} />
                <Text size="sm">Sign out</Text>
              </Group>
            </UnstyledButton>
          </form>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
