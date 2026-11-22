"use client";

import { ActionIcon, Code, CopyButton, Group, Tooltip } from "@mantine/core";
import { Check, Copy } from "lucide-react";

/** A code block with a copy button. `testId` is on the code itself (its text is exactly `code`). */
export function CodeSnippet({ code, testId }: { code: string; testId?: string }) {
  return (
    <Group align="flex-start" gap="xs" wrap="nowrap">
      <Code
        block
        data-testid={testId}
        style={{ flex: 1, minWidth: 0, overflowX: "auto", whiteSpace: "pre" }}
      >
        {code}
      </Code>
      <CopyButton value={code}>
        {({ copied, copy }) => (
          <Tooltip label={copied ? "Copied" : "Copy"} withArrow>
            <ActionIcon variant="default" size="lg" onClick={copy} aria-label="Copy">
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </ActionIcon>
          </Tooltip>
        )}
      </CopyButton>
    </Group>
  );
}
