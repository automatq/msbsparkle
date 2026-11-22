"use client";

import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { autoAssignDayAction, type ActionResult } from "@/modules/admin/actions";

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300",
  CONFIRMED: "bg-sky-100 text-sky-900 dark:bg-sky-500/15 dark:text-sky-300",
  ASSIGNED: "bg-indigo-100 text-indigo-900 dark:bg-indigo-500/15 dark:text-indigo-300",
  EN_ROUTE: "bg-violet-100 text-violet-900 dark:bg-violet-500/15 dark:text-violet-300",
  IN_PROGRESS: "bg-blue-100 text-blue-900 dark:bg-blue-500/15 dark:text-blue-300",
  COMPLETED: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-300",
  CANCELLED: "bg-zinc-200 text-zinc-700 dark:bg-zinc-500/20 dark:text-zinc-300",
  SKIPPED: "bg-zinc-100 text-zinc-600 dark:bg-zinc-500/20 dark:text-zinc-300",
  NO_SHOW: "bg-rose-100 text-rose-900 dark:bg-rose-500/15 dark:text-rose-300",
  ACTIVE: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-300",
  PAUSED: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300",
  UNPAID: "bg-zinc-100 text-zinc-700 dark:bg-zinc-500/20 dark:text-zinc-300",
  PAID: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-300",
  FAILED: "bg-rose-100 text-rose-900 dark:bg-rose-500/15 dark:text-rose-300",
  WAIVED: "bg-zinc-100 text-zinc-600 dark:bg-zinc-500/20 dark:text-zinc-300",
  REFUNDED: "bg-orange-100 text-orange-900 dark:bg-orange-500/15 dark:text-orange-300",
  PARTIALLY_REFUNDED: "bg-orange-100 text-orange-900 dark:bg-orange-500/15 dark:text-orange-300",
  CAPTURED: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-300",
  REQUIRES_ACTION: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300",
  DRAFT: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300",
  PUBLISHED: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-300",
  ARCHIVED: "bg-zinc-100 text-zinc-600 dark:bg-zinc-500/20 dark:text-zinc-300",
  ONBOARDING: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300",
  INACTIVE: "bg-zinc-100 text-zinc-600 dark:bg-zinc-500/20 dark:text-zinc-300",
  SUSPENDED: "bg-rose-100 text-rose-900 dark:bg-rose-500/15 dark:text-rose-300",
  REQUESTED: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300",
  APPROVED: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-300",
  DENIED: "bg-zinc-200 text-zinc-700 dark:bg-zinc-500/20 dark:text-zinc-300",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? "bg-muted text-muted-foreground"}`}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

/** Button that runs a server action, toasts the result, and refreshes the route. */
export function ActionButton({
  action,
  children,
  variant = "outline",
  size = "sm",
  confirm,
  className,
  onDone,
  testId,
}: {
  action: () => Promise<ActionResult>;
  children: ReactNode;
  variant?: "default" | "outline" | "destructive" | "ghost" | "secondary";
  size?: "sm" | "default" | "xs";
  confirm?: string;
  className?: string;
  onDone?: () => void;
  testId?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      data-testid={testId}
      disabled={pending}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        start(async () => {
          const res = await action();
          if (res.ok) {
            toast.success(res.message ?? "Done");
            res.warnings?.forEach((w) => toast.warning(w));
            router.refresh();
            onDone?.();
          } else toast.error(res.message);
        });
      }}
    >
      {pending ? "…" : children}
    </Button>
  );
}

export function AutoAssignButton({
  regionId,
  date,
  count,
}: {
  regionId: string;
  date: string;
  count: number;
}) {
  return (
    <ActionButton
      action={() => autoAssignDayAction(regionId, date)}
      variant="default"
      size="sm"
      confirm={`Auto-assign ${count} unassigned job${count === 1 ? "" : "s"} using availability, history and ratings?`}
    >
      Auto-assign {count}
    </ActionButton>
  );
}
