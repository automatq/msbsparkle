"use client";

import {
  ActionIcon,
  Box,
  Menu,
  Tooltip,
  useComputedColorScheme,
  useMantineColorScheme,
  type MantineColorScheme,
} from "@mantine/core";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useEffect } from "react";

/**
 * Keeps the Tailwind components' `.dark` class in step with Mantine's color scheme while the admin
 * is mounted, and puts the page back to light when leaving it (the public site is light-only).
 */
export function ColorSchemeSync() {
  const computed = useComputedColorScheme("light", { getInitialValueInEffect: false });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", computed === "dark");
  }, [computed]);
  useEffect(
    () => () => {
      const d = document.documentElement;
      d.classList.remove("dark");
      d.setAttribute("data-mantine-color-scheme", "light");
    },
    [],
  );
  return null;
}

const OPTIONS: { value: MantineColorScheme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "auto", label: "Match device", icon: Monitor },
];

/** Light / Dark / Auto switch for the admin header. Remembered per browser. */
export function ColorSchemeToggle() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  return (
    <Menu position="bottom-end" width={180} withinPortal>
      <Menu.Target>
        <Tooltip label="Appearance" openDelay={400}>
          <ActionIcon
            variant="default"
            size="lg"
            aria-label="Appearance"
            data-testid="color-scheme-toggle"
          >
            {/* Both icons, shown by CSS from the scheme attribute the inline script sets before
                paint: correct at once, and server and client render the same markup. */}
            <Box component="span" darkHidden lh={0}>
              <Sun size={16} strokeWidth={1.75} />
            </Box>
            <Box component="span" lightHidden lh={0}>
              <Moon size={16} strokeWidth={1.75} />
            </Box>
          </ActionIcon>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Appearance</Menu.Label>
        {OPTIONS.map(({ value, label, icon: ItemIcon }) => (
          <Menu.Item
            key={value}
            leftSection={<ItemIcon size={14} strokeWidth={1.75} />}
            rightSection={colorScheme === value ? <Check size={14} /> : null}
            onClick={() => setColorScheme(value)}
          >
            {label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
