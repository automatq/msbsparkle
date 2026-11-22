"use client";

import { Button, Group, Loader, Select, TextInput } from "@mantine/core";
import { DatePickerInput, type DatesRangeValue } from "@mantine/dates";
import { useDebouncedCallback } from "@mantine/hooks";
import { CalendarDays, Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

/** Filters for the jobs list. Changes apply immediately and live in the URL, so they can be shared. */
export function JobFilters({
  from,
  to,
  status,
  regionId,
  q,
  statuses,
  regions,
  defaults,
}: {
  from: string;
  to: string;
  status: string;
  regionId: string;
  q: string;
  statuses: readonly string[];
  regions: { id: string; name: string }[];
  defaults: { from: string; to: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [range, setRange] = useState<DatesRangeValue<string>>([from, to]);
  const [search, setSearch] = useState(q);

  const apply = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };
  const applySearch = useDebouncedCallback((v: string) => apply({ q: v.trim() || null }), 350);

  const filtered = !!status || !!regionId || !!q || from !== defaults.from || to !== defaults.to;

  return (
    <Group align="flex-end" gap="sm" wrap="wrap">
      <DatePickerInput
        type="range"
        label="Dates"
        valueFormat="MMM D, YYYY"
        value={range}
        onChange={(v) => {
          setRange(v);
          if (v[0] && v[1]) apply({ from: v[0], to: v[1] });
        }}
        leftSection={<CalendarDays size={16} strokeWidth={1.75} />}
        w={{ base: "100%", sm: 260 }}
        allowSingleDateInRange
      />
      <Select
        label="Status"
        placeholder="Any"
        data={statuses.map((s) => ({ value: s, label: s.replaceAll("_", " ").toLowerCase() }))}
        value={status || null}
        onChange={(v) => apply({ status: v })}
        clearable
        w={{ base: "100%", xs: 170 }}
      />
      <Select
        label="Region"
        placeholder="All"
        data={regions.map((r) => ({ value: r.id, label: r.name }))}
        value={regionId || null}
        onChange={(v) => apply({ region: v })}
        clearable
        searchable
        w={{ base: "100%", xs: 170 }}
      />
      <TextInput
        label="Search"
        placeholder="Booking # or customer"
        value={search}
        onChange={(e) => {
          setSearch(e.currentTarget.value);
          applySearch(e.currentTarget.value);
        }}
        leftSection={<Search size={16} strokeWidth={1.75} />}
        rightSection={pending ? <Loader size={14} /> : null}
        w={{ base: "100%", sm: 240 }}
      />
      {filtered && (
        <Button
          variant="subtle"
          color="gray"
          leftSection={<X size={14} />}
          onClick={() => {
            setRange([defaults.from, defaults.to]);
            setSearch("");
            start(() => router.replace(pathname, { scroll: false }));
          }}
        >
          Clear
        </Button>
      )}
    </Group>
  );
}
