"use client";

import { Button, type ButtonProps } from "@mantine/core";
import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/modules/admin/actions";

/**
 * Mantine button that runs a server action: optional confirm, a toast with the result (and any
 * warnings), then a refresh. Same behavior as the legacy ActionButton in ../ui.tsx.
 */
export function ActionButton({
  action,
  children,
  confirm,
  onDone,
  testId,
  ...button
}: {
  action: () => Promise<ActionResult>;
  children: ReactNode;
  confirm?: string;
  onDone?: () => void;
  testId?: string;
} & Omit<ButtonProps, "children" | "loading">) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="default"
      size="xs"
      {...button}
      type="button"
      data-testid={testId}
      loading={pending}
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
      {children}
    </Button>
  );
}
