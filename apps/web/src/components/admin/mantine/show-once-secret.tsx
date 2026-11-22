"use client";

import { Alert, Button, Group, Stack, Text } from "@mantine/core";
import { KeyRound } from "lucide-react";
import type { ReactNode } from "react";
import { CodeSnippet } from "./code-snippet";

/** A secret shown once after it's created (API keys, webhook signing secrets). */
export function ShowOnceSecret({
  title,
  children,
  secret,
  testId,
  onDone,
}: {
  title: string;
  children: ReactNode;
  secret: string;
  testId: string;
  onDone: () => void;
}) {
  return (
    <Alert color="yellow" variant="light" icon={<KeyRound size={18} />} title={title}>
      <Stack gap="xs">
        <Text size="sm">{children}</Text>
        <CodeSnippet code={secret} testId={testId} />
        <Group>
          <Button size="xs" variant="default" onClick={onDone}>
            I&apos;ve saved it
          </Button>
        </Group>
      </Stack>
    </Alert>
  );
}
