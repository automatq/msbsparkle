import { Badge, type MantineColor } from "@mantine/core";

const COLORS: Record<string, MantineColor> = {
  PENDING: "yellow",
  CONFIRMED: "blue",
  ASSIGNED: "indigo",
  EN_ROUTE: "violet",
  IN_PROGRESS: "cyan",
  COMPLETED: "teal",
  CANCELLED: "gray",
  SKIPPED: "gray",
  NO_SHOW: "red",
  UNPAID: "gray",
  AUTHORIZED: "cyan",
  PAID: "teal",
  FAILED: "red",
  WAIVED: "gray",
  REFUNDED: "orange",
  PARTIALLY_REFUNDED: "orange",
};

/** Job and payment statuses as Mantine badges (Mantine pages; others use StatusBadge). */
export function StatusPill({ status }: { status: string }) {
  return (
    <Badge color={COLORS[status] ?? "gray"} variant="light" radius="sm" tt="none" fw={500}>
      {status
        .replaceAll("_", " ")
        .toLowerCase()
        .replace(/^./, (c) => c.toUpperCase())}
    </Badge>
  );
}
