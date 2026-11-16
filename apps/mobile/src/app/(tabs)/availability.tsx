import { useState } from "react";
import { Alert, Switch, TextInput } from "react-native";
import type { Availability, AvailabilityRow } from "@msb/shared/mobile-api";
import { ApiRequestError } from "@/api";
import { useAvailability, useRequestTimeOff, useSaveAvailability } from "@/api/hooks";
import {
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

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
type DayState = { on: boolean; startLocal: string; endLocal: string };

function toDays(rows: AvailabilityRow[]): DayState[] {
  return DAYS.map((_, weekday) => {
    const r = rows.find((x) => x.weekday === weekday);
    return r
      ? { on: true, startLocal: r.startLocal, endLocal: r.endLocal }
      : { on: false, startLocal: "08:00", endLocal: "17:00" };
  });
}

const fail = (e: unknown) =>
  Alert.alert("Couldn't save", e instanceof ApiRequestError ? e.message : "Try again.");

export default function AvailabilityScreen() {
  const availability = useAvailability();
  if (availability.isPending) return <Loading />;
  if (availability.isError)
    return <ErrorView error={availability.error} onRetry={() => availability.refetch()} />;
  return <AvailabilityForm data={availability.data} />;
}

/** The form starts from the loaded data; it is only remounted when the screen is. */
function AvailabilityForm({ data }: { data: Availability }) {
  const save = useSaveAvailability();
  const timeOff = useRequestTimeOff();
  const c = useColors();
  const [days, setDays] = useState<DayState[]>(() => toDays(data.rows));
  const [off, setOff] = useState({ startsAt: "", endsAt: "", reason: "" });

  const input = {
    borderColor: c.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    fontSize: 16,
    color: c.text,
    minWidth: 76,
  } as const;
  const set = (i: number, patch: Partial<DayState>) =>
    setDays(days.map((d, n) => (n === i ? { ...d, ...patch } : d)));

  return (
    <Screen keyboardShouldPersistTaps="handled">
      <T variant="muted">Times are in {data.timezone.replace("_", " ")}.</T>
      {days.map((d, i) => (
        <Card key={DAYS[i]}>
          <Row style={{ justifyContent: "space-between" }}>
            <T variant="heading">{DAYS[i]}</T>
            <Switch
              value={d.on}
              onValueChange={(on) => set(i, { on })}
              accessibilityLabel={`Available ${DAYS[i]}`}
            />
          </Row>
          {d.on ? (
            <Row>
              <TextInput
                style={input}
                value={d.startLocal}
                onChangeText={(v) => set(i, { startLocal: v })}
                placeholder="08:00"
                placeholderTextColor={c.muted}
                keyboardType="numbers-and-punctuation"
                accessibilityLabel={`${DAYS[i]} start`}
              />
              <T>to</T>
              <TextInput
                style={input}
                value={d.endLocal}
                onChangeText={(v) => set(i, { endLocal: v })}
                placeholder="17:00"
                placeholderTextColor={c.muted}
                keyboardType="numbers-and-punctuation"
                accessibilityLabel={`${DAYS[i]} end`}
              />
            </Row>
          ) : null}
        </Card>
      ))}
      <Button
        title="Save availability"
        loading={save.isPending}
        onPress={() =>
          save
            .mutateAsync(
              days.flatMap((d, weekday) =>
                d.on ? [{ weekday, startLocal: d.startLocal, endLocal: d.endLocal }] : [],
              ),
            )
            .then(() => Alert.alert("Saved", "Your availability is updated."), fail)
        }
      />

      <Section title="Time off">
        {data.timeOff.map((t) => (
          <Card key={t.id}>
            <T>
              {t.startsAt} → {t.endsAt} · {t.status.toLowerCase()}
              {t.reason ? ` · ${t.reason}` : ""}
            </T>
          </Card>
        ))}
        <Card>
          <Row>
            <TextInput
              style={[input, { flex: 1 }]}
              value={off.startsAt}
              onChangeText={(startsAt) => setOff({ ...off, startsAt })}
              placeholder="From YYYY-MM-DD"
              placeholderTextColor={c.muted}
              accessibilityLabel="Time off from"
            />
            <TextInput
              style={[input, { flex: 1 }]}
              value={off.endsAt}
              onChangeText={(endsAt) => setOff({ ...off, endsAt })}
              placeholder="To YYYY-MM-DD"
              placeholderTextColor={c.muted}
              accessibilityLabel="Time off to"
            />
          </Row>
          <TextInput
            style={input}
            value={off.reason}
            onChangeText={(reason) => setOff({ ...off, reason })}
            placeholder="Reason (optional)"
            placeholderTextColor={c.muted}
            accessibilityLabel="Reason"
          />
          <Button
            title="Request time off"
            variant="outline"
            loading={timeOff.isPending}
            disabled={!off.startsAt || !off.endsAt}
            onPress={() =>
              timeOff.mutateAsync(off).then(() => {
                setOff({ startsAt: "", endsAt: "", reason: "" });
                Alert.alert("Requested", "Your dispatcher will confirm it.");
              }, fail)
            }
          />
        </Card>
      </Section>
    </Screen>
  );
}
