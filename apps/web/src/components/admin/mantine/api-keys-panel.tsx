"use client";

import {
  ActionIcon,
  Alert,
  Button,
  Code,
  CopyButton,
  Group,
  Paper,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { Check, Copy, KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createApiKeyAction, revokeApiKeyAction } from "@/modules/api/actions";

export type ApiKeyView = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

const when = (s: string | null) => (s ? new Date(s).toLocaleString() : "Never");

export function NewApiKey({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [key, setKey] = useState<string | null>(null);

  if (key)
    return (
      <Alert color="yellow" icon={<KeyRound size={18} />} title="Copy your key now">
        <Stack gap="xs">
          <Text size="sm">
            This is the only time it&apos;s shown. Store it in your app&apos;s secrets; if it&apos;s
            lost, revoke it and create a new one.
          </Text>
          <Group gap="xs" wrap="nowrap">
            <Code block style={{ flex: 1, wordBreak: "break-all" }} data-testid="api-key-value">
              {key}
            </Code>
            <CopyButton value={key}>
              {({ copied, copy }) => (
                <Tooltip label={copied ? "Copied" : "Copy"}>
                  <ActionIcon variant="default" size="lg" onClick={copy} aria-label="Copy key">
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                  </ActionIcon>
                </Tooltip>
              )}
            </CopyButton>
          </Group>
          <Group>
            <Button
              size="xs"
              variant="default"
              onClick={() => {
                setKey(null);
                router.refresh();
              }}
            >
              I&apos;ve saved it
            </Button>
          </Group>
        </Stack>
      </Alert>
    );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createApiKeyAction(name);
          if (!r.ok) return void toast.error(r.message);
          setName("");
          setKey(r.key);
        });
      }}
    >
      <Group align="flex-end" gap="sm">
        <TextInput
          label="Key name"
          placeholder="e.g. Company website, Zapier, accounting sync"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          required
          maxLength={80}
          w={{ base: "100%", sm: 360 }}
        />
        <Button type="submit" loading={pending} disabled={disabled} data-testid="api-key-create">
          Create key
        </Button>
      </Group>
    </form>
  );
}

export function ApiKeyTable({ keys }: { keys: ApiKeyView[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!keys.length)
    return (
      <Text size="sm" c="dimmed">
        No keys yet.
      </Text>
    );
  return (
    <Paper p={0}>
      <Table.ScrollContainer minWidth={640}>
        <Table data-testid="api-keys">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Key</Table.Th>
              <Table.Th>Created</Table.Th>
              <Table.Th>Last used</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {keys.map((k) => (
              <Table.Tr key={k.id} c={k.revokedAt ? "dimmed" : undefined}>
                <Table.Td>{k.name}</Table.Td>
                <Table.Td>
                  <Code>{k.prefix}…</Code>
                </Table.Td>
                <Table.Td>{when(k.createdAt)}</Table.Td>
                <Table.Td>{when(k.lastUsedAt)}</Table.Td>
                <Table.Td ta="right">
                  {k.revokedAt ? (
                    <Text size="sm">Revoked</Text>
                  ) : (
                    <Button
                      size="xs"
                      variant="subtle"
                      color="red"
                      disabled={pending}
                      onClick={() => {
                        if (!confirm(`Revoke "${k.name}"? Apps using it stop working immediately.`))
                          return;
                        start(async () => {
                          const r = await revokeApiKeyAction(k.id);
                          if (!r.ok) return void toast.error(r.message);
                          toast.success("Key revoked.");
                          router.refresh();
                        });
                      }}
                    >
                      Revoke
                    </Button>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Paper>
  );
}
