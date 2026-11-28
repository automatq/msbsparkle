"use client";

import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  CopyButton,
  Group,
  Menu,
  Modal,
  MultiSelect,
  Paper,
  SegmentedControl,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import {
  Check,
  Copy,
  Ellipsis,
  KeyRound,
  ShieldOff,
  UserMinus,
  UserPlus,
  UserCog,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  inviteAdminAction,
  removeAdminAction,
  resetTwoFactorAction,
  sendPasswordLinkAction,
  setAdminAccessAction,
  type TeamActionResult,
} from "@/modules/admin/team-actions";
import type { AdminAccess, TeamMember } from "@/modules/auth/admin-users";

type Region = { id: string; name: string };
type Role = AdminAccess["role"];

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super admin",
  REGION_ADMIN: "Region admin",
};
const ROLE_HELP: Record<Role, string> = {
  SUPER_ADMIN: "Sees every region and can change pricing, taxes, promos, the team and settings.",
  REGION_ADMIN: "Runs dispatch, bookings, customers and cleaners for the regions you pick.",
};

function toAccess(role: Role, regionIds: string[]): AdminAccess {
  return role === "SUPER_ADMIN" ? { role } : { role, regionIds };
}

/** Role picker plus the regions a region admin is limited to. */
function AccessFields({
  role,
  regionIds,
  regions,
  onChange,
}: {
  role: Role;
  regionIds: string[];
  regions: Region[];
  onChange: (role: Role, regionIds: string[]) => void;
}) {
  return (
    <Stack gap="xs">
      <SegmentedControl
        fullWidth
        value={role}
        onChange={(v) => onChange(v as Role, regionIds)}
        data={[
          { value: "REGION_ADMIN", label: ROLE_LABEL.REGION_ADMIN },
          { value: "SUPER_ADMIN", label: ROLE_LABEL.SUPER_ADMIN },
        ]}
        aria-label="Role"
      />
      <Text size="sm" c="dimmed">
        {ROLE_HELP[role]}
      </Text>
      {role === "REGION_ADMIN" ? (
        <MultiSelect
          label="Regions"
          placeholder={regionIds.length ? undefined : "Choose regions"}
          data={regions.map((r) => ({ value: r.id, label: r.name }))}
          value={regionIds}
          onChange={(v) => onChange(role, v)}
          searchable
          clearable
          required
        />
      ) : null}
    </Stack>
  );
}

/** Shown after an invitation or reset: the link, in case the email needs passing on by hand. */
function LinkNotice({
  link,
  onClose,
}: {
  link: { url: string; emailed: boolean };
  onClose: () => void;
}) {
  return (
    <Alert
      color={link.emailed ? "teal" : "yellow"}
      title={link.emailed ? "Email sent" : "The email could not be sent"}
      withCloseButton
      onClose={onClose}
      data-testid="team-link"
    >
      <Stack gap="xs">
        <Text size="sm">
          {link.emailed
            ? "They can also use this link. It works once."
            : "Send them this link yourself. It works once."}
        </Text>
        <Group gap="xs" wrap="nowrap">
          <TextInput
            value={link.url}
            readOnly
            flex={1}
            aria-label="Set-password link"
            onFocus={(e) => e.currentTarget.select()}
          />
          <CopyButton value={link.url}>
            {({ copied, copy }) => (
              <Button
                variant="default"
                onClick={copy}
                leftSection={copied ? <Check size={14} /> : <Copy size={14} />}
              >
                {copied ? "Copied" : "Copy"}
              </Button>
            )}
          </CopyButton>
        </Group>
      </Stack>
    </Alert>
  );
}

export function TeamPanel({ members, regions }: { members: TeamMember[]; regions: Region[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [link, setLink] = useState<{ url: string; emailed: boolean } | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState({
    name: "",
    email: "",
    role: "REGION_ADMIN" as Role,
    regionIds: [] as string[],
  });
  const [editing, setEditing] = useState<{
    member: TeamMember;
    role: Role;
    regionIds: string[];
  } | null>(null);

  /** Runs an action, toasts the outcome, refreshes the list and reports success. */
  const run = (action: () => Promise<TeamActionResult>, after?: (res: TeamActionResult) => void) =>
    start(async () => {
      const res = await action();
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success(res.message);
      if (res.link) setLink({ url: res.link, emailed: !res.warnings?.length });
      router.refresh();
      after?.(res);
    });

  return (
    <Stack gap="md">
      <Group justify="flex-end">
        <Button
          leftSection={<UserPlus size={16} strokeWidth={1.75} />}
          onClick={() => setInviteOpen(true)}
        >
          Invite admin
        </Button>
      </Group>

      {link ? <LinkNotice link={link} onClose={() => setLink(null)} /> : null}

      <Paper p={0}>
        <Table.ScrollContainer minWidth={640}>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Access</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Two-factor</Table.Th>
                <Table.Th aria-label="Actions" />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {members.map((m) => (
                <Table.Tr key={m.id} data-testid={`team-${m.email}`}>
                  <Table.Td>
                    <Text fw={500}>
                      {m.name ?? m.email}
                      {m.isYou ? (
                        <Text span c="dimmed" fw={400}>
                          {" "}
                          (you)
                        </Text>
                      ) : null}
                    </Text>
                    <Text size="sm" c="dimmed">
                      {m.email}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text>{ROLE_LABEL[m.access.role]}</Text>
                    {m.access.role === "REGION_ADMIN" ? (
                      <Text size="sm" c="dimmed">
                        {m.regionNames.join(", ") || "No regions"}
                      </Text>
                    ) : null}
                  </Table.Td>
                  <Table.Td>
                    <Badge
                      variant="light"
                      radius="sm"
                      tt="none"
                      fw={500}
                      color={
                        m.state === "active" ? "teal" : m.state === "invited" ? "yellow" : "gray"
                      }
                    >
                      {m.state === "active"
                        ? "Active"
                        : m.state === "invited"
                          ? "Invited"
                          : "Disabled"}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c={m.twoFactor ? undefined : "dimmed"}>
                      {m.twoFactor ? "On" : "Off"}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right">
                    <Menu position="bottom-end" withinPortal>
                      <Menu.Target>
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          aria-label={`Actions for ${m.name ?? m.email}`}
                          disabled={pending}
                        >
                          <Ellipsis size={16} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item
                          leftSection={<UserCog size={14} />}
                          disabled={m.isYou}
                          onClick={() =>
                            setEditing({
                              member: m,
                              role: m.access.role,
                              regionIds: m.access.role === "REGION_ADMIN" ? m.access.regionIds : [],
                            })
                          }
                        >
                          Change access
                        </Menu.Item>
                        <Menu.Item
                          leftSection={<KeyRound size={14} />}
                          disabled={m.state === "disabled"}
                          onClick={() => run(() => sendPasswordLinkAction(m.id))}
                        >
                          {m.state === "invited" ? "Resend invitation" : "Send password reset"}
                        </Menu.Item>
                        {m.twoFactor ? (
                          <Menu.Item
                            leftSection={<ShieldOff size={14} />}
                            disabled={m.isYou}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Turn off two-factor sign-in for ${m.name ?? m.email}? Use this when they've lost their authenticator. They'll be signed out.`,
                                )
                              )
                                run(() => resetTwoFactorAction(m.id));
                            }}
                          >
                            Reset two-factor
                          </Menu.Item>
                        ) : null}
                        <Menu.Divider />
                        <Menu.Item
                          color="red"
                          leftSection={<UserMinus size={14} />}
                          disabled={m.isYou}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Remove ${m.name ?? m.email} from the team? They'll be signed out and lose admin access.`,
                              )
                            )
                              run(() => removeAdminAction(m.id));
                          }}
                        >
                          Remove from team
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>

      <Modal opened={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite an admin">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () =>
                inviteAdminAction({
                  name: invite.name,
                  email: invite.email,
                  access: toAccess(invite.role, invite.regionIds),
                }),
              () => {
                setInviteOpen(false);
                setInvite({ name: "", email: "", role: "REGION_ADMIN", regionIds: [] });
              },
            );
          }}
        >
          <Stack gap="sm">
            <TextInput
              label="Name"
              value={invite.name}
              onChange={(e) => setInvite({ ...invite, name: e.currentTarget.value })}
              required
              data-autofocus
            />
            <TextInput
              label="Email"
              type="email"
              value={invite.email}
              onChange={(e) => setInvite({ ...invite, email: e.currentTarget.value })}
              required
            />
            <AccessFields
              role={invite.role}
              regionIds={invite.regionIds}
              regions={regions}
              onChange={(role, regionIds) => setInvite({ ...invite, role, regionIds })}
            />
            <Group justify="flex-end" mt="xs">
              <Button variant="default" onClick={() => setInviteOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={pending}>
                Send invitation
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal
        opened={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `Access for ${editing.member.name ?? editing.member.email}` : ""}
      >
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(
                () =>
                  setAdminAccessAction(
                    editing.member.id,
                    toAccess(editing.role, editing.regionIds),
                  ),
                () => setEditing(null),
              );
            }}
          >
            <Stack gap="sm">
              <AccessFields
                role={editing.role}
                regionIds={editing.regionIds}
                regions={regions}
                onChange={(role, regionIds) => setEditing({ ...editing, role, regionIds })}
              />
              <Group justify="flex-end" mt="xs">
                <Button variant="default" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button type="submit" loading={pending}>
                  Save access
                </Button>
              </Group>
            </Stack>
          </form>
        ) : null}
      </Modal>
    </Stack>
  );
}
