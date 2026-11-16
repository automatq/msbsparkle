import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import type { ColorValue } from "react-native";
import { useColors } from "@/components/ui";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

function TabIcon({ name, color, size }: { name: IconName; color: ColorValue; size: number }) {
  return <Ionicons name={name} color={color as string} size={size} />;
}
const icon = (name: IconName) =>
  function Icon({ color, size }: { color: ColorValue; size: number }) {
    return <TabIcon name={name} color={color} size={size} />;
  };

export default function TabsLayout() {
  const c = useColors();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: c.text,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.bg, borderTopColor: c.border },
        headerStyle: { backgroundColor: c.bg },
        headerTintColor: c.text,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Today", tabBarIcon: icon("today-outline") }} />
      <Tabs.Screen
        name="earnings"
        options={{ title: "Earnings", tabBarIcon: icon("cash-outline") }}
      />
      <Tabs.Screen
        name="availability"
        options={{ title: "Availability", tabBarIcon: icon("calendar-outline") }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: "Settings", tabBarIcon: icon("settings-outline") }}
      />
    </Tabs>
  );
}
