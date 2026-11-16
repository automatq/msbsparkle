import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Linking, Platform, Pressable, RefreshControl, View } from "react-native";
import type { JobDetail, PhotoKind } from "@msb/shared/mobile-api";
import { ApiRequestError } from "@/api";
import { useJob, useJobActions, useMe } from "@/api/hooks";
import { useAccessToken } from "@/auth/use-access-token";
import {
  Badge,
  Button,
  Card,
  ErrorView,
  Loading,
  Row,
  Screen,
  Section,
  T,
  useColors,
} from "@/components/ui";
import { API_URL } from "@/lib/config";
import { dayLabel } from "@/lib/format";
import { addPhoto, usePendingPhotos } from "@/photos/queue";
import {
  currentPosition,
  requestTrackingPermission,
  startTracking,
  stopTracking,
} from "@/tracking/location";

function mapsUrl(job: JobDetail) {
  const q = encodeURIComponent(
    `${job.address.line1}, ${job.address.city} ${job.address.postalCode}`,
  );
  return Platform.OS === "ios"
    ? `https://maps.apple.com/?daddr=${q}`
    : `https://www.google.com/maps/dir/?api=1&destination=${q}`;
}

function errorText(e: unknown) {
  return e instanceof ApiRequestError ? e.message : "Can't reach the server. Try again.";
}

export default function JobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const job = useJob(id);
  const me = useMe();
  const actions = useJobActions(id);
  const c = useColors();
  const token = useAccessToken();
  const pending = usePendingPhotos(id);
  const [note, setNote] = useState<string | null>(null);

  if (job.isPending) return <Loading />;
  if (job.isError) return <ErrorView error={job.error} onRetry={() => job.refetch()} />;
  const j = job.data;
  const can = j.can;

  /** Runs an action, then shows the server's message and any warnings. */
  async function act<T>(
    fn: () => Promise<{ data: T; message?: string; warnings?: string[] }>,
    after?: (data: T) => Promise<void> | void,
  ) {
    try {
      const r = await fn();
      await after?.(r.data);
      setNote(r.message ?? null);
      if (r.warnings?.length) Alert.alert("Heads up", r.warnings.join("\n"));
    } catch (e) {
      Alert.alert("Couldn't do that", errorText(e));
    }
  }

  async function onMyWay() {
    const perm = await requestTrackingPermission();
    const position = perm === "denied" ? null : await currentPosition();
    await act(
      () => actions.enRoute.mutateAsync(position),
      async () => {
        const live = perm === "background" && (await startTracking(id));
        if (!live)
          Alert.alert(
            "Location sharing is off",
            'The customer got their tracking link, but without "Always" location access they won\'t see you move. You can change this in Settings.',
          );
      },
    );
  }

  async function checkIn() {
    const position = await currentPosition();
    await act(
      () => actions.checkIn.mutateAsync(position),
      () => stopTracking(),
    );
  }

  async function checkOut() {
    const position = await currentPosition();
    await act(() => actions.checkOut.mutateAsync(position));
  }

  async function takePhoto(kind: PhotoKind) {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Camera access needed", "Allow camera access in Settings to add job photos.");
      return;
    }
    const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1 });
    if (shot.canceled || !shot.assets[0]) return;
    const a = shot.assets[0];
    try {
      await addPhoto(id, kind, { uri: a.uri, width: a.width, height: a.height });
      setNote("Photo added. It uploads in the background.");
      setTimeout(() => job.refetch(), 3000);
    } catch {
      Alert.alert("Couldn't save the photo", "Try taking it again.");
    }
  }

  const sections = [...new Set(j.checklist.map((i) => i.section))];

  return (
    <>
      <Stack.Screen options={{ title: j.bookingNumber }} />
      <Screen
        refreshControl={
          <RefreshControl refreshing={job.isRefetching} onRefresh={() => void job.refetch()} />
        }
      >
        <T variant="title">
          {dayLabel(j.scheduledDate, me.data?.locale)} · {j.windowStartLocal}–{j.windowEndLocal}
        </T>
        <Row>
          <Badge status={j.assignmentStatus === "OFFERED" ? "OFFER" : j.jobStatus} />
          <T variant="small">
            ~{Math.round((j.estimatedMinutes / 60) * 10) / 10}h
            {j.teammates.length ? ` · with ${j.teammates.join(", ")}` : ""}
          </T>
        </Row>
        {note ? <T style={{ color: c.success }}>{note}</T> : null}

        {can.canRespond ? (
          <Row>
            <Button
              title="Accept"
              loading={actions.respond.isPending}
              onPress={() => act(() => actions.respond.mutateAsync(true))}
            />
            <Button
              title="Decline"
              variant="outline"
              onPress={() =>
                Alert.alert("Decline this job?", undefined, [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Decline",
                    style: "destructive",
                    onPress: () => act(() => actions.respond.mutateAsync(false)),
                  },
                ])
              }
            />
          </Row>
        ) : null}

        {can.isOpen && !j.checkOutAt ? (
          <Row>
            {can.canGoEnRoute ? (
              <Button
                title="On my way"
                variant="outline"
                loading={actions.enRoute.isPending}
                onPress={onMyWay}
              />
            ) : null}
            {can.canCheckIn ? (
              <Button
                title="Check in"
                loading={actions.checkIn.isPending}
                onPress={checkIn}
                testID="check-in"
              />
            ) : null}
            {can.canCheckOut ? (
              <Button
                title="Check out & complete"
                loading={actions.checkOut.isPending}
                onPress={checkOut}
                testID="check-out"
              />
            ) : null}
          </Row>
        ) : null}
        {j.checkOutAt && j.jobStatus !== "COMPLETED" ? (
          <T variant="muted">{"You're checked out of this job."}</T>
        ) : null}
        {j.jobStatus === "COMPLETED" ? (
          <T style={{ color: c.success }}>Completed. Nice work!</T>
        ) : null}

        <Card>
          <T variant="heading">
            {j.address.line1}
            {j.address.line2 ? `, ${j.address.line2}` : ""}
          </T>
          <T variant="muted">
            {j.address.city} {j.address.postalCode}
          </T>
          <Pressable onPress={() => Linking.openURL(mapsUrl(j))} accessibilityRole="link">
            <T style={{ textDecorationLine: "underline" }}>Directions</T>
          </Pressable>
          {j.address.entryInstructions ? <T>Entry: {j.address.entryInstructions}</T> : null}
          {j.address.parkingInstructions ? <T>Parking: {j.address.parkingInstructions}</T> : null}
          {j.notes.customer ? <T>Customer: {j.notes.customer}</T> : null}
          {j.notes.dispatch ? <T>Dispatch: {j.notes.dispatch}</T> : null}
          {j.customer ? (
            <Row>
              <T variant="muted">
                {j.customer.firstName} {j.customer.lastName}
              </T>
              {j.customer.phone ? (
                <Pressable
                  onPress={() => Linking.openURL(`tel:${j.customer!.phone}`)}
                  accessibilityRole="link"
                >
                  <T style={{ textDecorationLine: "underline" }}>{j.customer.phone}</T>
                </Pressable>
              ) : null}
            </Row>
          ) : null}
        </Card>

        <Card>
          <T variant="heading">
            {j.serviceName}
            {j.home.firstCleanUpgrade ? " · first-clean upgrade" : ""}
          </T>
          <T variant="muted">
            {j.home.bedrooms} bed · {j.home.bathrooms} bath
            {j.home.sqft ? ` · ${j.home.sqft} sq ft` : ""}
          </T>
          {j.home.extras.length ? (
            <T variant="muted">
              Extras:{" "}
              {j.home.extras
                .map((e) => `${e.slug.replaceAll("-", " ")}${e.qty > 1 ? ` ×${e.qty}` : ""}`)
                .join(", ")}
            </T>
          ) : null}
        </Card>

        {j.checklist.length ? (
          <Section title="Checklist">
            {!can.canEditChecklist && can.isOpen && !j.checkInAt ? (
              <T variant="small">Check in to tick items off.</T>
            ) : null}
            {sections.map((s) => (
              <Card key={s}>
                <T variant="heading">{s}</T>
                {j.checklist
                  .filter((i) => i.section === s)
                  .map((i) => (
                    <Pressable
                      key={i.id}
                      disabled={!can.canEditChecklist || actions.checklist.isPending}
                      onPress={() =>
                        act(() => actions.checklist.mutateAsync({ itemId: i.id, done: !i.done }))
                      }
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: i.done, disabled: !can.canEditChecklist }}
                      style={{ flexDirection: "row", gap: 10, alignItems: "center", minHeight: 40 }}
                    >
                      <Ionicons
                        name={i.done ? "checkbox" : "square-outline"}
                        size={24}
                        color={can.canEditChecklist ? c.text : c.muted}
                      />
                      <T style={{ flex: 1 }}>
                        {i.label}
                        {i.requiresPhoto ? " (required)" : ""}
                      </T>
                    </Pressable>
                  ))}
              </Card>
            ))}
          </Section>
        ) : null}

        {can.canSeePhotos ? (
          <Section title="Photos">
            {j.photos.length ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {j.photos.map((p) => (
                  <View key={p.id} style={{ width: "31%", gap: 2 }}>
                    <Image
                      source={{
                        uri: `${API_URL}${p.url}`,
                        headers: token ? { authorization: `Bearer ${token}` } : undefined,
                      }}
                      style={{
                        width: "100%",
                        aspectRatio: 1,
                        borderRadius: 10,
                        backgroundColor: c.card,
                      }}
                      contentFit="cover"
                      accessibilityLabel={`${p.kind.toLowerCase()} photo`}
                    />
                    <T variant="small">{p.kind.toLowerCase()}</T>
                  </View>
                ))}
              </View>
            ) : null}
            {pending.length ? (
              <T variant="small">
                {pending.length} photo{pending.length > 1 ? "s" : ""} waiting to upload
                {pending[0]?.lastError ? ` (${pending[0].lastError})` : ""}
              </T>
            ) : null}
            {can.canAddPhotos ? (
              <Row>
                <Button title="Before" variant="outline" onPress={() => takePhoto("BEFORE")} />
                <Button title="After" variant="outline" onPress={() => takePhoto("AFTER")} />
                <Button title="Issue" variant="outline" onPress={() => takePhoto("ISSUE")} />
              </Row>
            ) : null}
          </Section>
        ) : null}
      </Screen>
    </>
  );
}
