/** Minimal UI kit: follows the system light/dark setting; big touch targets for use on the job. */
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import type { ReactNode } from "react";
import type { ScrollViewProps, StyleProp, TextStyle, ViewStyle } from "react-native";
import { STATUS_LABEL } from "@/lib/format";

export const palette = {
  light: {
    bg: "#ffffff",
    card: "#f4f4f5",
    border: "#e4e4e7",
    text: "#09090b",
    muted: "#71717a",
    primary: "#111111",
    primaryText: "#ffffff",
    danger: "#b91c1c",
    success: "#047857",
    warn: "#b45309",
  },
  dark: {
    bg: "#09090b",
    card: "#18181b",
    border: "#27272a",
    text: "#fafafa",
    muted: "#a1a1aa",
    primary: "#fafafa",
    primaryText: "#09090b",
    danger: "#f87171",
    success: "#34d399",
    warn: "#fbbf24",
  },
};
export type Palette = (typeof palette)["light"];

export function useColors(): Palette {
  return palette[useColorScheme() === "dark" ? "dark" : "light"];
}

export function Screen({ children, ...props }: ScrollViewProps & { children: ReactNode }) {
  const c = useColors();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 48 }}
      contentInsetAdjustmentBehavior="automatic"
      {...props}
    >
      {children}
    </ScrollView>
  );
}

export function T({
  children,
  variant = "body",
  style,
  ...rest
}: {
  children: ReactNode;
  variant?: "title" | "heading" | "body" | "muted" | "small" | "big";
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  selectable?: boolean;
}) {
  const c = useColors();
  const v: Record<string, TextStyle> = {
    title: { fontSize: 24, fontWeight: "700", color: c.text },
    heading: { fontSize: 17, fontWeight: "600", color: c.text },
    body: { fontSize: 16, color: c.text },
    muted: { fontSize: 15, color: c.muted },
    small: { fontSize: 13, color: c.muted },
    big: { fontSize: 30, fontWeight: "700", color: c.text },
  };
  return (
    <Text style={[v[variant], style]} {...rest}>
      {children}
    </Text>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return (
    <View
      style={[
        {
          backgroundColor: c.card,
          borderRadius: 14,
          padding: 14,
          gap: 6,
          borderColor: c.border,
          borderWidth: StyleSheet.hairlineWidth,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = "primary",
  loading,
  disabled,
  testID,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "outline" | "danger";
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  const c = useColors();
  const bg = variant === "primary" ? c.primary : "transparent";
  const fg = variant === "primary" ? c.primaryText : variant === "danger" ? c.danger : c.text;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => ({
        backgroundColor: bg,
        borderColor: variant === "primary" ? bg : variant === "danger" ? c.danger : c.border,
        borderWidth: 1,
        borderRadius: 12,
        minHeight: 52,
        paddingHorizontal: 16,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        flexGrow: 1,
      })}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={{ color: fg, fontSize: 17, fontWeight: "600" }}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flexDirection: "row", gap: 8, alignItems: "center" }, style]}>{children}</View>
  );
}

export function Badge({ status }: { status: string }) {
  const c = useColors();
  const color =
    status === "COMPLETED"
      ? c.success
      : ["CANCELLED", "SKIPPED", "NO_SHOW"].includes(status)
        ? c.danger
        : status === "EN_ROUTE" || status === "IN_PROGRESS"
          ? c.warn
          : c.muted;
  return (
    <Text style={{ color, fontSize: 13, fontWeight: "600" }}>
      {status === "OFFER" ? "Offer" : (STATUS_LABEL[status] ?? status)}
    </Text>
  );
}

export function Loading() {
  const c = useColors();
  return (
    <View
      style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.bg }}
    >
      <ActivityIndicator />
    </View>
  );
}

export function ErrorView({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <Screen>
      <T variant="heading">Couldn&apos;t load this</T>
      <T variant="muted">{error instanceof Error ? error.message : "Something went wrong."}</T>
      {onRetry ? <Button title="Try again" variant="outline" onPress={onRetry} /> : null}
    </Screen>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8, marginTop: 8 }}>
      <T variant="small" style={{ textTransform: "uppercase", letterSpacing: 0.6 }}>
        {title}
      </T>
      {children}
    </View>
  );
}
