"use client";

import { MantineProvider, createTheme, type CSSVariablesResolver } from "@mantine/core";
import { DatesProvider } from "@mantine/dates";
import type { ReactNode } from "react";

/**
 * Mantine for the admin dashboard only. It reuses the site's design tokens (globals.css), so
 * Mantine components and the existing Tailwind ones look like one system.
 */
const theme = createTheme({
  fontFamily: "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
  fontFamilyMonospace: "var(--font-geist-mono), ui-monospace, monospace",
  headings: { fontFamily: "var(--font-sans), ui-sans-serif, system-ui, sans-serif" },
  // The site's buttons are near-black; Mantine's "dark" scale matches them.
  primaryColor: "dark",
  primaryShade: 8,
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
  dark: {},
});

export function AdminMantineProvider({ children }: { children: ReactNode }) {
  return (
    <MantineProvider theme={theme} cssVariablesResolver={resolver} forceColorScheme="light">
      <DatesProvider settings={{ firstDayOfWeek: 0 }}>{children}</DatesProvider>
    </MantineProvider>
  );
}
