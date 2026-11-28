"use client";

import { ActionIcon, Button, Group, Loader, Select } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { autoAssignDayAction } from "@/modules/admin/actions";
import { ActionButton } from "./action-button";

/** Region, day and auto-assign controls for the dispatch board. Every change is a URL change. */
export function DispatchToolbar({
  regionId,
  regions,
  date,
  today,
  prev,
  next,
  unassigned,
}: {
  regionId: string;
  regions: { id: string; label: string }[];
  date: string;
  today: string;
  prev: string;
  next: string;
  unassigned: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const go = (d: string, r = regionId) =>
    start(() => router.push(`/admin/calendar?region=${r}&date=${d}`, { scroll: false }));

  return (
    <Group gap="xs" wrap="wrap" align="flex-end">
      {regions.length > 1 ? (
        <Select
          aria-label="Region"
          data={regions.map((r) => ({ value: r.id, label: r.label }))}
          value={regionId}
          onChange={(v) => v && go(date, v)}
          allowDeselect={false}
          w={{ base: "100%", xs: 220 }}
          data-testid="dispatch-region"
        />
      ) : null}
      <DatePickerInput
        aria-label="Day"
        value={date}
        onChange={(v) => v && go(v)}
        valueFormat="ddd, MMM D"
        leftSection={<CalendarDays size={16} strokeWidth={1.75} />}
        w={160}
      />
      <Group gap={4} wrap="nowrap">
        <ActionIcon
          variant="default"
          size="input-sm"
          aria-label="Previous day"
          onClick={() => go(prev)}
        >
          <ChevronLeft size={16} />
        </ActionIcon>
        <Button variant="default" onClick={() => go(today)} disabled={date === today}>
          Today
        </Button>
        <ActionIcon
          variant="default"
          size="input-sm"
          aria-label="Next day"
          onClick={() => go(next)}
        >
          <ChevronRight size={16} />
        </ActionIcon>
      </Group>
      {unassigned ? (
        <ActionButton
          size="sm"
          variant="filled"
          action={() => autoAssignDayAction(regionId, date)}
          confirm={`Auto-assign ${unassigned} unassigned job${unassigned === 1 ? "" : "s"} using availability, history and ratings?`}
        >
          Auto-assign {unassigned}
        </ActionButton>
      ) : null}
      {pending ? <Loader size="xs" /> : null}
    </Group>
  );
}
