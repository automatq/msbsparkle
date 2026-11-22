import { Group, Paper, Skeleton, Stack } from "@mantine/core";

/** Shown instantly while an admin page's data loads (the shell and nav stay in place). */
export default function AdminLoading() {
  return (
    <Stack gap="lg" aria-busy="true" aria-label="Loading">
      <Group justify="space-between">
        <Skeleton h={28} w={180} />
        <Skeleton h={32} w={120} />
      </Group>
      <Group gap="sm">
        <Skeleton h={36} w={260} />
        <Skeleton h={36} w={170} />
        <Skeleton h={36} w={170} />
      </Group>
      <Paper p="md">
        <Stack gap="sm">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} h={20} />
          ))}
        </Stack>
      </Paper>
    </Stack>
  );
}
