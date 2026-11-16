import * as Application from "expo-application";
import * as Location from "expo-location";
import { useEffect, useState } from "react";
import { Alert, Linking } from "react-native";
import { useMe } from "@/api/hooks";
import { useAuth } from "@/auth/auth";
import { Button, Card, Screen, Section, T } from "@/components/ui";
import { API_URL } from "@/lib/config";
import { registerForPush, type PushStatus } from "@/push/push";

const PUSH_TEXT: Record<PushStatus, string> = {
  registered: "On. You'll get job offers, changes and reminders here.",
  denied: "Off. Turn notifications on in Settings to get job offers instantly.",
  unsupported: "Not available on this device.",
  error: "Couldn't register. Try again.",
};

export default function SettingsScreen() {
  const me = useMe();
  const { signOut } = useAuth();
  const [push, setPush] = useState<PushStatus | null>(null);
  const [location, setLocation] = useState<string>("…");

  useEffect(() => {
    void registerForPush().then(setPush);
    void Location.getBackgroundPermissionsAsync().then((p) =>
      setLocation(
        p.status === "granted"
          ? "Always: customers see you on the way."
          : 'Not "Always": customers get your ETA but won\'t see you move.',
      ),
    );
  }, []);

  return (
    <Screen>
      {me.data ? (
        <Card>
          <T variant="heading">
            {me.data.firstName} {me.data.lastName}
          </T>
          <T variant="muted">{me.data.homeRegion}</T>
        </Card>
      ) : null}
      <Section title="Notifications">
        <T>{push ? PUSH_TEXT[push] : "…"}</T>
        {push === "denied" ? (
          <Button title="Open Settings" variant="outline" onPress={() => Linking.openSettings()} />
        ) : null}
      </Section>
      <Section title="Location">
        <T>{location}</T>
        <T variant="small">{'Shared only between "On my way" and check-in.'}</T>
        <Button
          title="Location settings"
          variant="outline"
          onPress={() => Linking.openSettings()}
        />
      </Section>
      <Section title="App">
        <T variant="small">
          Version {Application.nativeApplicationVersion ?? "dev"} (
          {Application.nativeBuildVersion ?? "-"}) · {API_URL.replace(/^https?:\/\//, "")}
        </T>
      </Section>
      <Button
        title="Sign out"
        variant="danger"
        onPress={() =>
          Alert.alert("Sign out?", undefined, [
            { text: "Cancel", style: "cancel" },
            { text: "Sign out", style: "destructive", onPress: () => void signOut() },
          ])
        }
      />
    </Screen>
  );
}
