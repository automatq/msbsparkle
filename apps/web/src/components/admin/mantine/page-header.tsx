import { Group, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";

/** Standard admin page heading: title, optional one-line description, actions on the right. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <Group justify="space-between" align="flex-start" gap="sm">
      <div>
        <Title order={1} fz={24} fw={600}>
          {title}
        </Title>
        {description ? (
          <Text size="sm" c="dimmed">
            {description}
          </Text>
        ) : null}
      </div>
      {actions ? <Group gap="xs">{actions}</Group> : null}
    </Group>
  );
}
