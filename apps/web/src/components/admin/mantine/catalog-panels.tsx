"use client";

import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/modules/admin/actions";
import {
  deleteChecklistAction,
  deleteExtraAction,
  deleteServiceAction,
  saveChecklistAction,
  saveExtraAction,
  saveServiceAction,
} from "@/modules/admin/catalog-actions";
import { formatCents } from "@/modules/shared/money";

const ICON = { size: 16, strokeWidth: 1.75 } as const;
const cents = (v: string | number) => Math.round(Number(v || 0) * 100);

/** Runs a catalog action, toasts the outcome and refreshes the page data. */
function useCatalogAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (action: () => Promise<ActionResult>, onDone?: () => void) =>
    start(async () => {
      const res = await action();
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success(res.message ?? "Saved");
      router.refresh();
      onDone?.();
    });
  return { pending, run };
}

/** Services / Add-ons / Checklists switcher shared by the three catalog pages. */
export function CatalogTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const value = pathname.endsWith("/extras")
    ? "extras"
    : pathname.endsWith("/checklists")
      ? "checklists"
      : "services";
  return (
    <Tabs
      value={value}
      onChange={(v) => router.push(v === "services" ? "/admin/catalog" : `/admin/catalog/${v}`)}
    >
      <Tabs.List>
        <Tabs.Tab value="services">Services</Tabs.Tab>
        <Tabs.Tab value="extras">Add-ons</Tabs.Tab>
        <Tabs.Tab value="checklists">Checklists</Tabs.Tab>
      </Tabs.List>
    </Tabs>
  );
}

function PriceNote({ children }: { children: ReactNode }) {
  return (
    <Text size="sm" c="dimmed">
      {children}{" "}
      <Text component={Link} href="/admin/pricing" span inherit td="underline">
        Pricing
      </Text>
      .
    </Text>
  );
}

function StatusBadges({ active, missingPrice }: { active: boolean; missingPrice: boolean }) {
  return (
    <Group gap={6} wrap="nowrap">
      <Badge
        variant="light"
        radius="sm"
        tt="none"
        fw={500}
        color={active ? "teal" : "gray"}
        style={{ flexShrink: 0 }}
      >
        {active ? "Offered" : "Off"}
      </Badge>
      {missingPrice ? (
        <Badge
          variant="light"
          radius="sm"
          tt="none"
          fw={500}
          color="red"
          leftSection={<TriangleAlert size={12} />}
        >
          No price
        </Badge>
      ) : null}
    </Group>
  );
}

function RowActions({
  name,
  onEdit,
  onDelete,
  disabled,
}: {
  name: string;
  onEdit: () => void;
  onDelete: () => void;
  disabled: boolean;
}) {
  return (
    <Group gap={4} justify="flex-end" wrap="nowrap">
      <ActionIcon variant="subtle" color="gray" aria-label={`Edit ${name}`} onClick={onEdit}>
        <Pencil {...ICON} />
      </ActionIcon>
      <ActionIcon
        variant="subtle"
        color="red"
        aria-label={`Delete ${name}`}
        disabled={disabled}
        onClick={onDelete}
      >
        <Trash2 {...ICON} />
      </ActionIcon>
    </Group>
  );
}

function PriceFields({
  label,
  price,
  minutes,
  onChange,
  minutesHelp,
  priceHelp,
}: {
  label: string;
  price: string | number;
  minutes: string | number;
  onChange: (patch: { price?: string | number; minutes?: string | number }) => void;
  minutesHelp: string;
  priceHelp: string;
}) {
  return (
    <Group grow align="flex-start">
      <NumberInput
        label={label}
        description={priceHelp}
        prefix="$"
        min={0}
        decimalScale={2}
        fixedDecimalScale
        value={price}
        onChange={(v) => onChange({ price: v })}
        required
      />
      <NumberInput
        label="Minutes"
        description={minutesHelp}
        min={0}
        step={5}
        allowDecimal={false}
        value={minutes}
        onChange={(v) => onChange({ minutes: v })}
        required
      />
    </Group>
  );
}

// ── Services ────────────────────────────────────────────────────────────────

export type ServiceRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  pricingModel: "FLAT" | "HOURLY";
  isUpgrade: boolean;
  checklist: { id: string; name: string } | null;
  sortOrder: number;
  active: boolean;
  inUse: boolean;
  baseCents: number | null;
  baseMinutes: number | null;
  upgradeCents: number | null;
  missingPrice: boolean;
};

type ServiceForm = {
  id?: string;
  name: string;
  description: string;
  pricingModel: "FLAT" | "HOURLY";
  isUpgrade: boolean;
  checklistTemplateId: string | null;
  sortOrder: string | number;
  active: boolean;
  basePrice: string | number;
  baseMinutes: string | number;
  upgradePrice: string | number;
  upgradeMinutes: string | number;
  /** Whether prices already exist (then they are changed in Pricing, not here). */
  hasBase: boolean;
  hasUpgrade: boolean;
};

const newService = (sortOrder: number): ServiceForm => ({
  name: "",
  description: "",
  pricingModel: "FLAT",
  isUpgrade: false,
  checklistTemplateId: null,
  sortOrder,
  active: true,
  basePrice: "",
  baseMinutes: 120,
  upgradePrice: "",
  upgradeMinutes: 60,
  hasBase: false,
  hasUpgrade: false,
});

export function ServicesPanel({
  services,
  checklists,
}: {
  services: ServiceRow[];
  checklists: { id: string; name: string }[];
}) {
  const { pending, run } = useCatalogAction();
  const [form, setForm] = useState<ServiceForm | null>(null);
  const set = (patch: Partial<ServiceForm>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const needsBase = !!form && form.pricingModel === "FLAT" && !form.hasBase;
  const needsUpgrade = !!form && form.isUpgrade && !form.hasUpgrade;

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <Text size="sm" c="dimmed" maw={620}>
          What customers can book. Turning a service off hides it from the booking form and the
          website; existing bookings keep it.
        </Text>
        <Button
          leftSection={<Plus {...ICON} />}
          onClick={() => setForm(newService((services.at(-1)?.sortOrder ?? 0) + 10))}
        >
          Add service
        </Button>
      </Group>

      <Paper p={0}>
        <Table.ScrollContainer minWidth={720}>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Service</Table.Th>
                <Table.Th>Pricing</Table.Th>
                <Table.Th>Checklist</Table.Th>
                <Table.Th w={170}>Status</Table.Th>
                <Table.Th aria-label="Actions" />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {services.map((s) => (
                <Table.Tr key={s.id} data-testid={`service-${s.slug}`}>
                  <Table.Td>
                    <Text fw={500}>{s.name}</Text>
                    <Text size="sm" c="dimmed" lineClamp={1}>
                      {s.description || s.slug}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    {s.pricingModel === "HOURLY" ? (
                      <Text>Hourly</Text>
                    ) : (
                      <Text>{s.baseCents == null ? "—" : `From ${formatCents(s.baseCents)}`}</Text>
                    )}
                    {s.isUpgrade ? (
                      <Text size="sm" c="dimmed">
                        First-clean upgrade
                        {s.upgradeCents == null ? "" : ` +${formatCents(s.upgradeCents)}`}
                      </Text>
                    ) : null}
                  </Table.Td>
                  <Table.Td>
                    <Text c={s.checklist ? undefined : "dimmed"}>
                      {s.checklist?.name ?? "None"}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <StatusBadges active={s.active} missingPrice={s.missingPrice} />
                  </Table.Td>
                  <Table.Td>
                    <RowActions
                      name={s.name}
                      disabled={pending}
                      onEdit={() =>
                        setForm({
                          id: s.id,
                          name: s.name,
                          description: s.description,
                          pricingModel: s.pricingModel,
                          isUpgrade: s.isUpgrade,
                          checklistTemplateId: s.checklist?.id ?? null,
                          sortOrder: s.sortOrder,
                          active: s.active,
                          basePrice: "",
                          baseMinutes: s.baseMinutes ?? 120,
                          upgradePrice: "",
                          upgradeMinutes: 60,
                          hasBase: s.baseCents != null,
                          hasUpgrade: s.upgradeCents != null,
                        })
                      }
                      onDelete={() => {
                        if (s.inUse) {
                          toast.error(
                            `${s.name} has bookings, so it can't be deleted. Turn it off to stop offering it.`,
                          );
                          return;
                        }
                        if (
                          window.confirm(`Delete ${s.name} and its prices? This can't be undone.`)
                        )
                          run(() => deleteServiceAction(s.id));
                      }}
                    />
                  </Table.Td>
                </Table.Tr>
              ))}
              {services.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={5}>
                    <Text c="dimmed" ta="center" py="md">
                      No services yet. Add the first one to start taking bookings.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : null}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>

      <Modal
        opened={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? "Edit service" : "Add a service"}
        size="lg"
      >
        {form ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(
                () =>
                  saveServiceAction({
                    id: form.id,
                    name: form.name,
                    description: form.description,
                    pricingModel: form.pricingModel,
                    isUpgrade: form.isUpgrade,
                    checklistTemplateId: form.checklistTemplateId,
                    sortOrder: Number(form.sortOrder || 0),
                    active: form.active,
                    startingPrice:
                      needsBase && form.basePrice !== ""
                        ? {
                            amountCents: cents(form.basePrice),
                            minutes: Number(form.baseMinutes || 0),
                          }
                        : undefined,
                    upgradePrice:
                      needsUpgrade && form.upgradePrice !== ""
                        ? {
                            amountCents: cents(form.upgradePrice),
                            minutes: Number(form.upgradeMinutes || 0),
                          }
                        : undefined,
                  }),
                () => setForm(null),
              );
            }}
          >
            <Stack gap="sm">
              <TextInput
                label="Name"
                value={form.name}
                onChange={(e) => set({ name: e.currentTarget.value })}
                required
                data-autofocus
              />
              <Textarea
                label="Description"
                description="Shown to customers when they choose a service."
                value={form.description}
                onChange={(e) => set({ description: e.currentTarget.value })}
                autosize
                minRows={2}
                maxLength={400}
              />
              <div>
                <Text size="sm" fw={500} mb={4}>
                  How it is priced
                </Text>
                <SegmentedControl
                  fullWidth
                  value={form.pricingModel}
                  onChange={(v) => set({ pricingModel: v as "FLAT" | "HOURLY" })}
                  data={[
                    { value: "FLAT", label: "Flat rate by home size" },
                    { value: "HOURLY", label: "By the hour" },
                  ]}
                  aria-label="How it is priced"
                />
              </div>
              {form.pricingModel === "HOURLY" ? (
                <PriceNote>Hourly services use the company hourly rate, set in</PriceNote>
              ) : needsBase ? (
                <PriceFields
                  label="Base price"
                  price={form.basePrice}
                  minutes={form.baseMinutes}
                  onChange={(p) =>
                    set({
                      ...(p.price !== undefined ? { basePrice: p.price } : {}),
                      ...(p.minutes !== undefined ? { baseMinutes: p.minutes } : {}),
                    })
                  }
                  priceHelp="Before rooms are added"
                  minutesHelp="Time for the smallest home"
                />
              ) : (
                <PriceNote>
                  Base price {formatCents(services.find((s) => s.id === form.id)?.baseCents ?? 0)}.
                  To change it, publish a new version in
                </PriceNote>
              )}
              <Checkbox
                label="Also offer as a first-clean upgrade"
                description="Customers starting a recurring plan can add it to their first visit."
                checked={form.isUpgrade}
                onChange={(e) => set({ isUpgrade: e.currentTarget.checked })}
              />
              {needsUpgrade ? (
                <PriceFields
                  label="Upgrade price"
                  price={form.upgradePrice}
                  minutes={form.upgradeMinutes}
                  onChange={(p) =>
                    set({
                      ...(p.price !== undefined ? { upgradePrice: p.price } : {}),
                      ...(p.minutes !== undefined ? { upgradeMinutes: p.minutes } : {}),
                    })
                  }
                  priceHelp="Added to the first visit"
                  minutesHelp="Extra time on the first visit"
                />
              ) : null}
              <Group grow align="flex-start">
                <Select
                  label="Checklist"
                  description="What cleaners tick off"
                  placeholder="None"
                  data={checklists.map((c) => ({ value: c.id, label: c.name }))}
                  value={form.checklistTemplateId}
                  onChange={(v) => set({ checklistTemplateId: v })}
                  clearable
                />
                <NumberInput
                  label="Position"
                  description="Lower numbers are listed first"
                  min={0}
                  allowDecimal={false}
                  value={form.sortOrder}
                  onChange={(v) => set({ sortOrder: v })}
                />
              </Group>
              <Switch
                label="Offer this service to customers"
                checked={form.active}
                onChange={(e) => set({ active: e.currentTarget.checked })}
              />
              {form.id ? (
                <Text size="xs" c="dimmed">
                  Web address /services/{services.find((s) => s.id === form.id)?.slug}. It stays the
                  same when you rename the service.
                </Text>
              ) : null}
              <Group justify="flex-end" mt="xs">
                <Button variant="default" onClick={() => setForm(null)}>
                  Cancel
                </Button>
                <Button type="submit" loading={pending}>
                  {form.id ? "Save service" : "Add service"}
                </Button>
              </Group>
            </Stack>
          </form>
        ) : null}
      </Modal>
    </Stack>
  );
}

// ── Add-ons ─────────────────────────────────────────────────────────────────

export type ExtraRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  unit: "FIXED" | "PER_UNIT";
  maxQty: number;
  sortOrder: number;
  active: boolean;
  priceCents: number | null;
  minutes: number | null;
  missingPrice: boolean;
};

type ExtraForm = {
  id?: string;
  name: string;
  description: string;
  unit: "FIXED" | "PER_UNIT";
  maxQty: string | number;
  sortOrder: string | number;
  active: boolean;
  price: string | number;
  minutes: string | number;
  hasPrice: boolean;
};

export function ExtrasPanel({ extras }: { extras: ExtraRow[] }) {
  const { pending, run } = useCatalogAction();
  const [form, setForm] = useState<ExtraForm | null>(null);
  const set = (patch: Partial<ExtraForm>) => setForm((f) => (f ? { ...f, ...patch } : f));

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <Text size="sm" c="dimmed" maw={620}>
          Optional extras a customer can add to a visit, such as inside the oven or windows.
        </Text>
        <Button
          leftSection={<Plus {...ICON} />}
          onClick={() =>
            setForm({
              name: "",
              description: "",
              unit: "FIXED",
              maxQty: 1,
              sortOrder: (extras.at(-1)?.sortOrder ?? 0) + 10,
              active: true,
              price: "",
              minutes: 30,
              hasPrice: false,
            })
          }
        >
          Add add-on
        </Button>
      </Group>

      <Paper p={0}>
        <Table.ScrollContainer minWidth={640}>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Add-on</Table.Th>
                <Table.Th>Price</Table.Th>
                <Table.Th>Adds</Table.Th>
                <Table.Th w={170}>Status</Table.Th>
                <Table.Th aria-label="Actions" />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {extras.map((x) => (
                <Table.Tr key={x.id} data-testid={`extra-${x.slug}`}>
                  <Table.Td>
                    <Text fw={500}>{x.name}</Text>
                    {x.description ? (
                      <Text size="sm" c="dimmed" lineClamp={1}>
                        {x.description}
                      </Text>
                    ) : null}
                  </Table.Td>
                  <Table.Td>
                    <Text>
                      {x.priceCents == null ? "—" : formatCents(x.priceCents)}
                      {x.unit === "PER_UNIT" ? " each" : ""}
                    </Text>
                    {x.unit === "PER_UNIT" ? (
                      <Text size="sm" c="dimmed">
                        Up to {x.maxQty}
                      </Text>
                    ) : null}
                  </Table.Td>
                  <Table.Td>
                    <Text>{x.minutes == null ? "—" : `${x.minutes} min`}</Text>
                  </Table.Td>
                  <Table.Td>
                    <StatusBadges active={x.active} missingPrice={x.missingPrice} />
                  </Table.Td>
                  <Table.Td>
                    <RowActions
                      name={x.name}
                      disabled={pending}
                      onEdit={() =>
                        setForm({
                          id: x.id,
                          name: x.name,
                          description: x.description,
                          unit: x.unit,
                          maxQty: x.maxQty,
                          sortOrder: x.sortOrder,
                          active: x.active,
                          price: "",
                          minutes: x.minutes ?? 30,
                          hasPrice: x.priceCents != null,
                        })
                      }
                      onDelete={() => {
                        if (window.confirm(`Delete ${x.name} and its price? This can't be undone.`))
                          run(() => deleteExtraAction(x.id));
                      }}
                    />
                  </Table.Td>
                </Table.Tr>
              ))}
              {extras.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={5}>
                    <Text c="dimmed" ta="center" py="md">
                      No add-ons yet.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : null}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>

      <Modal
        opened={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? "Edit add-on" : "Add an add-on"}
      >
        {form ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(
                () =>
                  saveExtraAction({
                    id: form.id,
                    name: form.name,
                    description: form.description,
                    unit: form.unit,
                    maxQty: Number(form.maxQty || 1),
                    sortOrder: Number(form.sortOrder || 0),
                    active: form.active,
                    startingPrice:
                      !form.hasPrice && form.price !== ""
                        ? { amountCents: cents(form.price), minutes: Number(form.minutes || 0) }
                        : undefined,
                  }),
                () => setForm(null),
              );
            }}
          >
            <Stack gap="sm">
              <TextInput
                label="Name"
                value={form.name}
                onChange={(e) => set({ name: e.currentTarget.value })}
                required
                data-autofocus
              />
              <TextInput
                label="Description"
                value={form.description}
                onChange={(e) => set({ description: e.currentTarget.value })}
                maxLength={300}
              />
              <div>
                <Text size="sm" fw={500} mb={4}>
                  Charged
                </Text>
                <SegmentedControl
                  fullWidth
                  value={form.unit}
                  onChange={(v) => set({ unit: v as "FIXED" | "PER_UNIT" })}
                  data={[
                    { value: "FIXED", label: "Once per visit" },
                    { value: "PER_UNIT", label: "Per item" },
                  ]}
                  aria-label="Charged"
                />
              </div>
              {form.unit === "PER_UNIT" ? (
                <NumberInput
                  label="Most a customer can order"
                  min={1}
                  max={50}
                  allowDecimal={false}
                  value={form.maxQty}
                  onChange={(v) => set({ maxQty: v })}
                />
              ) : null}
              {form.hasPrice ? (
                <PriceNote>
                  Price {formatCents(extras.find((x) => x.id === form.id)?.priceCents ?? 0)}. To
                  change it, publish a new version in
                </PriceNote>
              ) : (
                <PriceFields
                  label={form.unit === "PER_UNIT" ? "Price per item" : "Price"}
                  price={form.price}
                  minutes={form.minutes}
                  onChange={(p) =>
                    set({
                      ...(p.price !== undefined ? { price: p.price } : {}),
                      ...(p.minutes !== undefined ? { minutes: p.minutes } : {}),
                    })
                  }
                  priceHelp="What the customer pays"
                  minutesHelp="Time it adds to a visit"
                />
              )}
              <NumberInput
                label="Position"
                description="Lower numbers are listed first"
                min={0}
                allowDecimal={false}
                value={form.sortOrder}
                onChange={(v) => set({ sortOrder: v })}
              />
              <Switch
                label="Offer this add-on to customers"
                checked={form.active}
                onChange={(e) => set({ active: e.currentTarget.checked })}
              />
              <Group justify="flex-end" mt="xs">
                <Button variant="default" onClick={() => setForm(null)}>
                  Cancel
                </Button>
                <Button type="submit" loading={pending}>
                  {form.id ? "Save add-on" : "Add add-on"}
                </Button>
              </Group>
            </Stack>
          </form>
        ) : null}
      </Modal>
    </Stack>
  );
}

// ── Checklists ──────────────────────────────────────────────────────────────

export type ChecklistRow = {
  id: string;
  name: string;
  services: { id: string; name: string }[];
  items: { section: string; label: string; requiresPhoto: boolean }[];
};

type ChecklistForm = { id?: string; name: string; items: ChecklistRow["items"] };

export function ChecklistsPanel({ checklists }: { checklists: ChecklistRow[] }) {
  const { pending, run } = useCatalogAction();
  const [form, setForm] = useState<ChecklistForm | null>(null);
  const setItem = (i: number, patch: Partial<ChecklistRow["items"][number]>) =>
    setForm((f) =>
      f ? { ...f, items: f.items.map((it, n) => (n === i ? { ...it, ...patch } : it)) } : f,
    );
  const move = (i: number, by: -1 | 1) =>
    setForm((f) => {
      if (!f) return f;
      const j = i + by;
      if (j < 0 || j >= f.items.length) return f;
      const items = [...f.items];
      [items[i], items[j]] = [items[j], items[i]];
      return { ...f, items };
    });

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <Text size="sm" c="dimmed" maw={620}>
          What cleaners tick off during a visit. Attach a checklist to a service on the Services
          tab. Changes apply to visits that haven&apos;t started yet.
        </Text>
        <Button
          leftSection={<Plus {...ICON} />}
          onClick={() =>
            setForm({ name: "", items: [{ section: "", label: "", requiresPhoto: false }] })
          }
        >
          Add checklist
        </Button>
      </Group>

      <Paper p={0}>
        <Table.ScrollContainer minWidth={560}>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Checklist</Table.Th>
                <Table.Th>Items</Table.Th>
                <Table.Th>Used by</Table.Th>
                <Table.Th aria-label="Actions" />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {checklists.map((c) => (
                <Table.Tr key={c.id} data-testid={`checklist-${c.name}`}>
                  <Table.Td>
                    <Text fw={500}>{c.name}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text>{c.items.length}</Text>
                    <Text size="sm" c="dimmed">
                      {c.items.filter((i) => i.requiresPhoto).length} required
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text c={c.services.length ? undefined : "dimmed"}>
                      {c.services.map((s) => s.name).join(", ") || "No service"}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <RowActions
                      name={c.name}
                      disabled={pending}
                      onEdit={() => setForm({ id: c.id, name: c.name, items: c.items })}
                      onDelete={() => {
                        if (
                          window.confirm(
                            c.services.length
                              ? `Delete ${c.name}? ${c.services.map((s) => s.name).join(", ")} will have no checklist.`
                              : `Delete ${c.name}?`,
                          )
                        )
                          run(() => deleteChecklistAction(c.id));
                      }}
                    />
                  </Table.Td>
                </Table.Tr>
              ))}
              {checklists.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={4}>
                    <Text c="dimmed" ta="center" py="md">
                      No checklists yet.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : null}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>

      <Modal
        opened={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? "Edit checklist" : "Add a checklist"}
        size="xl"
      >
        {form ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(
                () => saveChecklistAction(form),
                () => setForm(null),
              );
            }}
          >
            <Stack gap="sm">
              <TextInput
                label="Name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.currentTarget.value })}
                required
                data-autofocus
              />
              <Alert variant="light" color="gray" p="xs">
                <Text size="sm">
                  Tick <b>Required</b> for items the cleaner must complete before they can check
                  out.
                </Text>
              </Alert>
              {form.items.map((item, i) => (
                <Group key={i} gap="xs" align="flex-end" wrap="nowrap">
                  <TextInput
                    label={i === 0 ? "Room" : undefined}
                    aria-label={`Room for item ${i + 1}`}
                    placeholder="Kitchen"
                    value={item.section}
                    onChange={(e) => setItem(i, { section: e.currentTarget.value })}
                    w={150}
                    required
                  />
                  <TextInput
                    label={i === 0 ? "Task" : undefined}
                    aria-label={`Task ${i + 1}`}
                    placeholder="Wipe counters"
                    value={item.label}
                    onChange={(e) => setItem(i, { label: e.currentTarget.value })}
                    flex={1}
                    required
                  />
                  <Checkbox
                    label="Required"
                    checked={item.requiresPhoto}
                    onChange={(e) => setItem(i, { requiresPhoto: e.currentTarget.checked })}
                    mb={8}
                  />
                  <ActionIcon.Group mb={4}>
                    <ActionIcon
                      variant="default"
                      aria-label={`Move item ${i + 1} up`}
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                    >
                      <ArrowUp size={14} />
                    </ActionIcon>
                    <ActionIcon
                      variant="default"
                      aria-label={`Move item ${i + 1} down`}
                      disabled={i === form.items.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      <ArrowDown size={14} />
                    </ActionIcon>
                    <ActionIcon
                      variant="default"
                      aria-label={`Remove item ${i + 1}`}
                      disabled={form.items.length === 1}
                      onClick={() =>
                        setForm({ ...form, items: form.items.filter((_, n) => n !== i) })
                      }
                    >
                      <Trash2 size={14} />
                    </ActionIcon>
                  </ActionIcon.Group>
                </Group>
              ))}
              <Group justify="space-between" mt="xs">
                <Button
                  variant="default"
                  leftSection={<Plus {...ICON} />}
                  onClick={() =>
                    setForm({
                      ...form,
                      items: [
                        ...form.items,
                        {
                          section: form.items.at(-1)?.section ?? "",
                          label: "",
                          requiresPhoto: false,
                        },
                      ],
                    })
                  }
                >
                  Add item
                </Button>
                <Group>
                  <Button variant="default" onClick={() => setForm(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" loading={pending}>
                    {form.id ? "Save checklist" : "Add checklist"}
                  </Button>
                </Group>
              </Group>
            </Stack>
          </form>
        ) : null}
      </Modal>
    </Stack>
  );
}
