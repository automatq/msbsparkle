"use client";

import {
  MantineProvider,
  createTheme,
  localStorageColorSchemeManager,
  virtualColor,
  type CSSVariablesResolver,
} from "@mantine/core";
import { DatesProvider } from "@mantine/dates";
import type { ReactNode } from "react";
import { ColorSchemeSync } from "./color-scheme";
import { COLOR_SCHEME_KEY } from "./color-scheme-script";

/**
 * Mantine for the admin dashboard only. It reuses the site's design tokens (globals.css), so
 * Mantine components and the existing Tailwind ones look like one system, in light and dark.
 */
const theme = createTheme({
  fontFamily: "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
  fontFamilyMonospace: "var(--font-geist-mono), ui-monospace, monospace",
  headings: { fontFamily: "var(--font-sans), ui-sans-serif, system-ui, sans-serif" },
  // The site's buttons are near-black in light mode and near-white in dark mode (globals.css
  // --primary); "brand" follows that, and autoContrast picks readable text on either.
  colors: { brand: virtualColor({ name: "brand", light: "dark", dark: "gray" }) },
  primaryColor: "brand",
  primaryShade: { light: 8, dark: 2 },
  autoContrast: true,
  defaultRadius: "md",
  radius: { md: "var(--radius)" },
  cursorType: "pointer",
  components: {
    Table: { defaultProps: { verticalSpacing: "sm", highlightOnHover: true } },
    Paper: { defaultProps: { withBorder: true, radius: "md" } },
  },
});

const resolver: CSSVariablesResolver = () => ({
  variables: {},
  light: {
    "--mantine-color-body": "var(--background)",
    "--mantine-color-text": "var(--foreground)",
    "--mantine-color-dimmed": "var(--muted-foreground)",
    "--mantine-color-default-border": "var(--border)",
  },
  // Same tokens: globals.css swaps their values under .dark, which ColorSchemeSync keeps in step.
  dark: {
    "--mantine-color-body": "var(--background)",
    "--mantine-color-text": "var(--foreground)",
    "--mantine-color-dimmed": "var(--muted-foreground)",
    "--mantine-color-default-border": "var(--border)",
  },
});

const colorSchemeManager = localStorageColorSchemeManager({ key: COLOR_SCHEME_KEY });

export function AdminMantineProvider({ children }: { children: ReactNode }) {
  return (
    <MantineProvider
      theme={theme}
      cssVariablesResolver={resolver}
      defaultColorScheme="light"
      colorSchemeManager={colorSchemeManager}
    >
      <ColorSchemeSync />
      <DatesProvider settings={{ firstDayOfWeek: 0 }}>{children}</DatesProvider>
    </MantineProvider>
  );
}
