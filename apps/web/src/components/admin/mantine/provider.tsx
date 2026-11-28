"use client";

import {
  MantineProvider,
  createTheme,
  localStorageColorSchemeManager,
  virtualColor,
  type CSSVariablesResolver,
  type MantineColorsTuple,
} from "@mantine/core";
import { DatesProvider } from "@mantine/dates";
import type { ReactNode } from "react";
import { ColorSchemeSync } from "./color-scheme";
import { COLOR_SCHEME_KEY } from "./color-scheme-script";

/**
 * Mantine for the admin dashboard only. It reuses the site's design tokens (globals.css), so
 * Mantine components and the existing Tailwind ones look like one system, in light and dark.
 *
 * The palettes below are those tokens' greys (oklch, hue 286) written out as hex, which Mantine
 * needs to work out contrast: the same steps as --well, --border, --input, --muted-foreground and
 * --foreground, so its hover and border shades match the Tailwind parts.
 */
// Light to dark. 8 is the light theme's --primary, 1 the dark theme's.
const ink: MantineColorsTuple = [
  "#fafafb",
  "#f4f4f4",
  "#e6e6e8",
  "#d1d1d3",
  "#aaaaad",
  "#808083",
  "#646467",
  "#3d3d40",
  "#0c0c0d",
  "#040405",
];
// The light theme's greys: 1 --well, 2 --well-strong, 3 --border, 4 --input, 6 --muted-foreground.
const gray: MantineColorsTuple = [
  "#fafafb",
  "#f4f4f4",
  "#e6e6e8",
  "#e2e2e3",
  "#d1d1d3",
  "#aaaaad",
  "#646467",
  "#3d3d40",
  "#29292b",
  "#0c0c0d",
];
// The dark theme's: 0 --foreground, 2 --muted-foreground, 4 --input, 5 --well-strong, 6 --well,
// 7 --background.
const dark: MantineColorsTuple = [
  "#f3f3f5",
  "#d0d1d3",
  "#9f9fa4",
  "#636367",
  "#3d3d40",
  "#242426",
  "#161618",
  "#0b0b0c",
  "#060607",
  "#030304",
];

// Things you press are round (globals.css); things you read keep the "md" radius.
const ROUND = 1000;
const round = { defaultProps: { radius: ROUND } };

// Mantine works out the colour of a mark drawn on the primary colour (a checkbox's tick, the
// current page) for the light scheme only, so on the dark theme's near-white primary it is white
// on white. Where a part is filled with the primary colour (no `color` or `iconColor`, and no
// variant other than filled), use the per-scheme contrast instead.
type MarkProps = { color?: string; iconColor?: string; variant?: string };
const onPrimary = (variable: string) => ({
  vars: (_theme: unknown, { color, iconColor, variant }: MarkProps) =>
    color || iconColor || (variant && variant !== "filled")
      ? {}
      : { root: { [variable]: "var(--mantine-primary-color-contrast)" } },
});

const theme = createTheme({
  fontFamily: "var(--font-special-gothic), ui-sans-serif, system-ui, sans-serif",
  fontFamilyMonospace: "var(--font-geist-mono), ui-monospace, monospace",
  // Headings are set wide (globals.css applies `wide` to h1–h3, <Title> included).
  headings: {
    fontFamily: "var(--font-special-gothic), ui-sans-serif, system-ui, sans-serif",
    fontWeight: "600",
  },
  // The Tailwind type scale in globals.css, so text-sm and size="sm" are the same size.
  fontSizes: {
    xs: "0.8125rem",
    sm: "0.9375rem",
    md: "1.0625rem",
    lg: "1.25rem",
    xl: "1.5rem",
  },
  lineHeights: { xs: "1.4", sm: "1.45", md: "1.5", lg: "1.3", xl: "1.2" },
  white: "#ffffff",
  black: ink[8],
  // The site's buttons are near-black in light mode and near-white in dark mode (globals.css
  // --primary): "brand" is ink at shade 8 or 1. It has to be a virtual colour, because only for
  // one does autoContrast work out the text colour per scheme (black on the dark theme's white).
  colors: { ink, brand: virtualColor({ name: "brand", light: "ink", dark: "ink" }), gray, dark },
  primaryColor: "brand",
  primaryShade: { light: 8, dark: 1 },
  autoContrast: true,
  defaultRadius: "md",
  radius: { xs: "0.25rem", sm: "0.5rem", md: "var(--radius)", lg: "1rem", xl: "1.5rem" },
  shadows: { md: "var(--lift)", lg: "var(--lift)", xl: "var(--lift)" },
  cursorType: "pointer",
  components: {
    Button: round,
    ActionIcon: round,
    CloseButton: round,
    Chip: { ...round, ...onPrimary("--chip-color") },
    Checkbox: { ...round, ...onPrimary("--checkbox-icon-color") },
    Radio: onPrimary("--radio-icon-color"),
    SegmentedControl: round,
    Pagination: { ...round, ...onPrimary("--pagination-active-color") },
    Stepper: onPrimary("--stepper-icon-color"),
    Indicator: onPrimary("--indicator-text-color"),
    NavLink: { styles: { root: { borderRadius: "var(--mantine-radius-xl)" } } },
    Menu: { defaultProps: { radius: "lg" }, styles: { item: { borderRadius: "var(--radius)" } } },
    Popover: { defaultProps: { radius: "lg" } },
    Combobox: { defaultProps: { radius: "lg" } },
    Modal: { defaultProps: { radius: "xl" } },
    Table: { defaultProps: { verticalSpacing: "sm", highlightOnHover: true } },
    Paper: { defaultProps: { withBorder: true, radius: "md" } },
  },
});

// Same tokens for both: globals.css swaps their values under .dark, which ColorSchemeSync keeps
// in step with Mantine's scheme.
const tokens = {
  "--mantine-color-body": "var(--background)",
  "--mantine-color-text": "var(--foreground)",
  "--mantine-color-dimmed": "var(--muted-foreground)",
  "--mantine-color-placeholder": "var(--muted-foreground)",
  "--mantine-color-default-border": "var(--border)",
  "--mantine-color-default-hover": "var(--well)",
  "--mantine-color-anchor": "var(--foreground)",
  "--mantine-color-error": "var(--destructive)",
  "--mantine-color-success": "var(--success)",
};

// Mantine's dark "light" variant is shade 9 darkened, which for greys is black: use the wells.
const darkLight = (name: string) => ({
  [`--mantine-color-${name}-light`]: "var(--well-strong)",
  [`--mantine-color-${name}-light-hover`]: "var(--input)",
  [`--mantine-color-${name}-light-color`]: "var(--foreground)",
});

const resolver: CSSVariablesResolver = () => ({
  variables: {},
  light: tokens,
  dark: {
    ...tokens,
    "--mantine-color-default-hover": "var(--well-strong)",
    ...darkLight("brand"),
    ...darkLight("gray"),
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
