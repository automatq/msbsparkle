import { TableTh } from "@mantine/core";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Column header that links to the same list sorted by `sortKey` (clicking the active column flips
 * the direction). Rendered on the server from the page's own search params.
 */
export function SortTh({
  path,
  params,
  sortKey,
  current,
  firstDir = "asc",
  ta,
  children,
}: {
  path: string;
  params: Record<string, string | string[] | undefined>;
  sortKey: string;
  current: { key: string; dir: "asc" | "desc" };
  firstDir?: "asc" | "desc";
  ta?: "left" | "right";
  children: ReactNode;
}) {
  const active = current.key === sortKey;
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (typeof v === "string" && v) next.set(k, v);
  next.set("sort", sortKey);
  next.set("dir", active ? (current.dir === "asc" ? "desc" : "asc") : firstDir);
  next.delete("page");
  const Icon = !active ? ArrowUpDown : current.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableTh
      ta={ta}
      aria-sort={active ? (current.dir === "asc" ? "ascending" : "descending") : undefined}
    >
      <Link
        href={`${path}?${next.toString()}`}
        replace
        scroll={false}
        className="inline-flex items-center gap-1 whitespace-nowrap hover:text-foreground"
      >
        {children}
        <Icon size={13} strokeWidth={1.75} className={active ? "" : "opacity-40"} />
      </Link>
    </TableTh>
  );
}
