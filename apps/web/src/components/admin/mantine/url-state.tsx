"use client";

import { Group, Loader, Pagination, Select, Text, TextInput, UnstyledButton } from "@mantine/core";
import { useDebouncedCallback } from "@mantine/hooks";
import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

/**
 * List state in the URL. `apply` merges a patch into the query string (null/"" removes a key) and
 * resets to page 1 unless the patch sets the page itself.
 */
export function useUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  const apply = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!("page" in patch)) next.delete("page");
    const qs = next.toString();
    start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };
  const clear = () => start(() => router.replace(pathname, { scroll: false }));

  return { params, pending, apply, clear };
}

/** Debounced search box bound to `?q=` (or another key). */
export function SearchFilter({
  value,
  placeholder,
  param = "q",
  label = "Search",
}: {
  value: string;
  placeholder: string;
  param?: string;
  label?: string;
}) {
  const { apply, pending } = useUrlState();
  const [text, setText] = useState(value);
  const push = useDebouncedCallback((v: string) => apply({ [param]: v.trim() || null }), 350);
  return (
    <TextInput
      label={label}
      placeholder={placeholder}
      value={text}
      onChange={(e) => {
        setText(e.currentTarget.value);
        push(e.currentTarget.value);
      }}
      leftSection={<Search size={16} strokeWidth={1.75} />}
      rightSection={pending ? <Loader size={14} /> : null}
      w={{ base: "100%", sm: 260 }}
    />
  );
}

/** Select bound to one query param; clearing it removes the param. */
export function SelectFilter({
  param,
  label,
  value,
  data,
  placeholder = "Any",
  searchable,
}: {
  param: string;
  label: string;
  value: string;
  data: { value: string; label: string }[];
  placeholder?: string;
  searchable?: boolean;
}) {
  const { apply } = useUrlState();
  return (
    <Select
      label={label}
      placeholder={placeholder}
      data={data}
      value={value || null}
      onChange={(v) => apply({ [param]: v })}
      clearable
      searchable={searchable}
      w={{ base: "100%", xs: 170 }}
    />
  );
}

/** Row of filters with a "Clear" link when anything is set. */
export function FilterBar({ active, children }: { active: boolean; children: ReactNode }) {
  const { clear } = useUrlState();
  return (
    <Group align="flex-end" gap="sm" wrap="wrap">
      {children}
      {active ? (
        <UnstyledButton onClick={clear} px="xs" py={8}>
          <Text size="sm" c="dimmed" td="underline">
            Clear filters
          </Text>
        </UnstyledButton>
      ) : null}
    </Group>
  );
}

/** "51–100 of 734" plus page buttons, bound to `?page=`. Hidden when everything fits on one page. */
export function Pager({
  page,
  pageSize,
  total,
}: {
  page: number;
  pageSize: number;
  total: number;
}) {
  const { apply } = useUrlState();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  return (
    <Group justify="space-between" gap="sm">
      <Text size="sm" c="dimmed">
        {first.toLocaleString()}–{last.toLocaleString()} of {total.toLocaleString()}
      </Text>
      {pages > 1 ? (
        <Pagination
          total={pages}
          value={Math.min(page, pages)}
          onChange={(n) => {
            apply({ page: n > 1 ? String(n) : null });
            window.scrollTo({ top: 0 });
          }}
          size="sm"
          withEdges={pages > 5}
        />
      ) : null}
    </Group>
  );
}
