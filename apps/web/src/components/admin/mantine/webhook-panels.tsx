"use client";

import {
  Badge,
  Button,
  Checkbox,
  Code,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  createEndpointAction,
  deleteEndpointAction,
  resendDeliveryAction,
  rotateSecretAction,
  sendTestEventAction,
  setEndpointEnabledAction,
  updateEndpointAction,
} from "@/modules/webhooks/actions";
import { WEBHOOK_EVENTS, WEBHOOK_EVENT_TYPES } from "@/modules/webhooks/events";
import { ShowOnceSecret } from "./show-once-secret";
import { StatusPill } from "./status-badge";

export type EndpointView = {
  id: string;
  url: string;
  description: string | null;
  events: string[];
  enabled: boolean;
  deliveries: {
    id: string;
    eventType: string;
    status: string;
    attempts: number;
    lastStatusCode: number | null;
    lastError: string | null;
    createdAt: string;
    nextAttemptAt: string | null;
  }[];
};

function sendToast(r: { delivered: boolean; status: number | null; error: string | null }) {
  if (r.delivered) toast.success(`Delivered (HTTP ${r.status}).`);
  else toast.error(`Not delivered: ${r.error ?? "unknown error"}`);
}

function SecretBox({ secret, onDone }: { secret: string; onDone: () => void }) {
  return (
    <ShowOnceSecret
      title="Signing secret: copy it now"
      secret={secret}
      testId="webhook-secret"
      onDone={onDone}
    >
      Your server uses it to check that requests really come from here. It won&apos;t be shown
      again; you can rotate it to get a new one.
    </ShowOnceSecret>
  );
}

function EventPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const all = value.length === 0;
  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>
        Events
      </Text>
      <Checkbox
        label="All events, including ones added later"
        checked={all}
        onChange={(e) => onChange(e.currentTarget.checked ? [] : ["booking.created"])}
        data-testid="webhook-all-events"
      />
      {!all && (
        <Checkbox.Group value={value} onChange={onChange}>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs" verticalSpacing="xs">
            {WEBHOOK_EVENT_TYPES.map((t) => (
              <Checkbox
                key={t}
                value={t}
                label={<Code fz="xs">{t}</Code>}
                description={WEBHOOK_EVENTS[t]}
              />
            ))}
          </SimpleGrid>
        </Checkbox.Group>
      )}
    </Stack>
  );
}

export function NewEndpointForm({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [events, setEvents] = useState<string[]>([]);
  const [secret, setSecret] = useState<string | null>(null);
  if (secret)
    return (
      <SecretBox
        secret={secret}
        onDone={() => {
          setSecret(null);
          router.refresh();
        }}
      />
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await createEndpointAction({ url, description, events });
          if (!res.ok) return void toast.error(res.message);
          setUrl("");
          setDescription("");
          setEvents([]);
          setSecret(res.secret);
        });
      }}
    >
      <Stack gap="md" maw={640}>
        <TextInput
          label="Endpoint URL"
          type="url"
          placeholder="https://example.com/webhooks/bookings"
          value={url}
          onChange={(e) => setUrl(e.currentTarget.value)}
          required
        />
        <TextInput
          label="Description (optional)"
          placeholder="e.g. CRM sync"
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
        />
        <EventPicker value={events} onChange={setEvents} />
        <Group>
          <Button type="submit" loading={pending} disabled={disabled} data-testid="webhook-create">
            Add endpoint
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

export function EndpointCard({ endpoint }: { endpoint: EndpointView }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState(endpoint.url);
  const [description, setDescription] = useState(endpoint.description ?? "");
  const [events, setEvents] = useState(endpoint.events);
  const [secret, setSecret] = useState<string | null>(null);

  return (
    <Paper p="md" data-testid="webhook-endpoint">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <div style={{ minWidth: 0 }}>
            <Text ff="monospace" size="sm" style={{ wordBreak: "break-all" }}>
              {endpoint.url}
            </Text>
            {endpoint.description ? (
              <Text size="sm" c="dimmed">
                {endpoint.description}
              </Text>
            ) : null}
            <Text size="xs" c="dimmed" mt={4}>
              {endpoint.events.length ? endpoint.events.join(", ") : "All events"}
            </Text>
          </div>
          <Badge color={endpoint.enabled ? "teal" : "gray"} variant="light">
            {endpoint.enabled ? "On" : "Off"}
          </Badge>
        </Group>

        <Group gap="xs">
          <Button
            size="xs"
            loading={pending}
            disabled={!endpoint.enabled}
            data-testid="webhook-test"
            onClick={() =>
              start(async () => {
                const r = await sendTestEventAction(endpoint.id);
                if (!r.ok) return void toast.error(r.message);
                sendToast(r);
                router.refresh();
              })
            }
          >
            Send test event
          </Button>
          <Button size="xs" variant="default" onClick={() => setEditing((v) => !v)}>
            {editing ? "Close" : "Edit"}
          </Button>
          <Button
            size="xs"
            variant="default"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await setEndpointEnabledAction(endpoint.id, !endpoint.enabled);
                if (!r.ok) return void toast.error(r.message);
                router.refresh();
              })
            }
          >
            {endpoint.enabled ? "Turn off" : "Turn on"}
          </Button>
          <Button
            size="xs"
            variant="default"
            disabled={pending}
            onClick={() => {
              if (!confirm("Rotate the signing secret? The old one stops working immediately."))
                return;
              start(async () => {
                const r = await rotateSecretAction(endpoint.id);
                if (!r.ok) return void toast.error(r.message);
                setSecret(r.secret);
              });
            }}
          >
            Rotate secret
          </Button>
          <Button
            size="xs"
            variant="light"
            color="red"
            disabled={pending}
            onClick={() => {
              if (!confirm("Delete this endpoint and its delivery history?")) return;
              start(async () => {
                const r = await deleteEndpointAction(endpoint.id);
                if (!r.ok) return void toast.error(r.message);
                toast.success("Endpoint deleted.");
                router.refresh();
              });
            }}
          >
            Delete
          </Button>
        </Group>

        {secret ? <SecretBox secret={secret} onDone={() => setSecret(null)} /> : null}

        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await updateEndpointAction(endpoint.id, { url, description, events });
                if (!r.ok) return void toast.error(r.message);
                toast.success("Saved.");
                setEditing(false);
                router.refresh();
              });
            }}
          >
            <Stack
              gap="sm"
              pt="sm"
              style={{ borderTop: "1px solid var(--mantine-color-default-border)" }}
            >
              <TextInput
                label="Endpoint URL"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.currentTarget.value)}
                required
              />
              <TextInput
                label="Description"
                value={description}
                onChange={(e) => setDescription(e.currentTarget.value)}
              />
              <EventPicker value={events} onChange={setEvents} />
              <Group>
                <Button size="xs" type="submit" loading={pending}>
                  Save
                </Button>
              </Group>
            </Stack>
          </form>
        ) : null}

        <div>
          <Text size="sm" fw={500} mb="xs">
            Recent deliveries
          </Text>
          {endpoint.deliveries.length ? (
            <Table.ScrollContainer minWidth={620}>
              <Table verticalSpacing={6} data-testid="webhook-deliveries">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>When</Table.Th>
                    <Table.Th>Event</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Result</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {endpoint.deliveries.map((d) => (
                    <Table.Tr key={d.id}>
                      <Table.Td style={{ whiteSpace: "nowrap" }}>
                        {new Date(d.createdAt).toLocaleString()}
                      </Table.Td>
                      <Table.Td>
                        <Code fz="xs">{d.eventType}</Code>
                      </Table.Td>
                      <Table.Td style={{ whiteSpace: "nowrap" }}>
                        <StatusPill status={d.status} />
                        {d.attempts > 1 ? (
                          <Text span size="xs" c="dimmed" ml={6}>
                            {d.attempts} tries
                          </Text>
                        ) : null}
                      </Table.Td>
                      <Table.Td maw={280}>
                        <Text size="xs" c="dimmed" lineClamp={2}>
                          {d.lastStatusCode ? `HTTP ${d.lastStatusCode}` : ""}
                          {d.lastError ? ` ${d.lastError}` : ""}
                          {d.status === "PENDING" && d.nextAttemptAt
                            ? ` Next try ${new Date(d.nextAttemptAt).toLocaleTimeString()}.`
                            : ""}
                        </Text>
                      </Table.Td>
                      <Table.Td ta="right">
                        {d.status !== "SUCCEEDED" || d.eventType !== "webhook.test" ? (
                          <Button
                            size="xs"
                            variant="subtle"
                            disabled={pending || !endpoint.enabled}
                            onClick={() =>
                              start(async () => {
                                const r = await resendDeliveryAction(d.id);
                                if (!r.ok) return void toast.error(r.message);
                                sendToast(r);
                                router.refresh();
                              })
                            }
                          >
                            Resend
                          </Button>
                        ) : null}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          ) : (
            <Text size="sm" c="dimmed">
              Nothing sent yet.
            </Text>
          )}
        </div>
      </Stack>
    </Paper>
  );
}
