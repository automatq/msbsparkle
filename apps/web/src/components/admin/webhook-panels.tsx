"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { CopySnippet } from "./copy-snippet";
import { StatusBadge } from "./ui";

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

function EventPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const all = value.length === 0;
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Events</legend>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={all}
          onChange={(e) => onChange(e.target.checked ? [] : ["booking.created"])}
          data-testid="webhook-all-events"
        />
        All events, including ones added later
      </label>
      {!all && (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {WEBHOOK_EVENT_TYPES.map((t) => (
            <label key={t} className="flex items-start gap-2 text-sm" title={WEBHOOK_EVENTS[t]}>
              <input
                type="checkbox"
                className="mt-1"
                checked={value.includes(t)}
                onChange={(e) =>
                  onChange(e.target.checked ? [...value, t] : value.filter((x) => x !== t))
                }
              />
              <span>
                <code className="text-xs">{t}</code>
                <span className="block text-xs text-muted-foreground">{WEBHOOK_EVENTS[t]}</span>
              </span>
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

function SecretBox({ secret, onDone }: { secret: string; onDone: () => void }) {
  return (
    <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm dark:bg-amber-950/30">
      <p className="font-medium">Signing secret: copy it now</p>
      <p className="text-muted-foreground">
        Your server uses it to check that requests really come from here. It won&apos;t be shown
        again; you can rotate it to get a new one.
      </p>
      <CopySnippet code={secret} testId="webhook-secret" />
      <Button size="sm" variant="ghost" onClick={onDone}>
        I&apos;ve saved it
      </Button>
    </div>
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
      className="max-w-2xl space-y-4"
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
      <div className="space-y-1.5">
        <Label htmlFor="webhook-url">Endpoint URL</Label>
        <Input
          id="webhook-url"
          type="url"
          placeholder="https://example.com/webhooks/bookings"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="webhook-description">Description (optional)</Label>
        <Input
          id="webhook-description"
          placeholder="e.g. CRM sync"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <EventPicker value={events} onChange={setEvents} />
      <Button type="submit" disabled={pending || disabled} data-testid="webhook-create">
        {pending ? "Adding…" : "Add endpoint"}
      </Button>
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

  const run = (fn: () => Promise<void>) => start(fn);

  return (
    <div className="space-y-4 rounded-xl border p-4" data-testid="webhook-endpoint">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-all font-mono text-sm">{endpoint.url}</p>
          {endpoint.description && (
            <p className="text-sm text-muted-foreground">{endpoint.description}</p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {endpoint.events.length ? endpoint.events.join(", ") : "All events"}
          </p>
        </div>
        <StatusBadge status={endpoint.enabled ? "ACTIVE" : "INACTIVE"} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={pending || !endpoint.enabled}
          data-testid="webhook-test"
          onClick={() =>
            run(async () => {
              const r = await sendTestEventAction(endpoint.id);
              if (!r.ok) return void toast.error(r.message);
              sendToast(r);
              router.refresh();
            })
          }
        >
          Send test event
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? "Close" : "Edit"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            run(async () => {
              const r = await setEndpointEnabledAction(endpoint.id, !endpoint.enabled);
              if (!r.ok) return void toast.error(r.message);
              router.refresh();
            })
          }
        >
          {endpoint.enabled ? "Turn off" : "Turn on"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => {
            if (!confirm("Rotate the signing secret? The old one stops working immediately."))
              return;
            run(async () => {
              const r = await rotateSecretAction(endpoint.id);
              if (!r.ok) return void toast.error(r.message);
              setSecret(r.secret);
            });
          }}
        >
          Rotate secret
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={pending}
          onClick={() => {
            if (!confirm("Delete this endpoint and its delivery history?")) return;
            run(async () => {
              const r = await deleteEndpointAction(endpoint.id);
              if (!r.ok) return void toast.error(r.message);
              toast.success("Endpoint deleted.");
              router.refresh();
            });
          }}
        >
          Delete
        </Button>
      </div>

      {secret && <SecretBox secret={secret} onDone={() => setSecret(null)} />}

      {editing && (
        <form
          className="space-y-3 border-t pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const r = await updateEndpointAction(endpoint.id, { url, description, events });
              if (!r.ok) return void toast.error(r.message);
              toast.success("Saved.");
              setEditing(false);
              router.refresh();
            });
          }}
        >
          <Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} required />
          <Input
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <EventPicker value={events} onChange={setEvents} />
          <Button size="sm" type="submit" disabled={pending}>
            Save
          </Button>
        </form>
      )}

      <div className="overflow-x-auto">
        <p className="mb-2 text-sm font-medium">Recent deliveries</p>
        {endpoint.deliveries.length ? (
          <table className="w-full text-left text-sm" data-testid="webhook-deliveries">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="py-1 pr-3 font-normal">When</th>
                <th className="py-1 pr-3 font-normal">Event</th>
                <th className="py-1 pr-3 font-normal">Status</th>
                <th className="py-1 pr-3 font-normal">Result</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {endpoint.deliveries.map((d) => (
                <tr key={d.id} className="border-t align-top">
                  <td className="py-1.5 pr-3 whitespace-nowrap">
                    {new Date(d.createdAt).toLocaleString()}
                  </td>
                  <td className="py-1.5 pr-3">
                    <code className="text-xs">{d.eventType}</code>
                  </td>
                  <td className="py-1.5 pr-3">
                    <StatusBadge status={d.status} />
                    {d.attempts > 1 && (
                      <span className="ml-1 text-xs text-muted-foreground">{d.attempts} tries</span>
                    )}
                  </td>
                  <td className="max-w-xs py-1.5 pr-3 text-xs text-muted-foreground">
                    {d.lastStatusCode ? `HTTP ${d.lastStatusCode}` : ""}
                    {d.lastError ? ` ${d.lastError}` : ""}
                    {d.status === "PENDING" && d.nextAttemptAt
                      ? ` Next try ${new Date(d.nextAttemptAt).toLocaleTimeString()}.`
                      : ""}
                  </td>
                  <td className="py-1.5 text-right">
                    {d.status !== "SUCCEEDED" || d.eventType !== "webhook.test" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending || !endpoint.enabled}
                        onClick={() =>
                          run(async () => {
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing sent yet.</p>
        )}
      </div>
    </div>
  );
}
