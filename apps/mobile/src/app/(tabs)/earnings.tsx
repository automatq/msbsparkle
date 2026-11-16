import { RefreshControl } from "react-native";
import { useEarnings, useMe } from "@/api/hooks";
import { Card, ErrorView, Loading, Row, Screen, T } from "@/components/ui";
import { dayLabel, money } from "@/lib/format";

export default function EarningsScreen() {
  const earnings = useEarnings();
  const me = useMe();
  if (earnings.isPending) return <Loading />;
  if (earnings.isError)
    return <ErrorView error={earnings.error} onRetry={() => earnings.refetch()} />;
  const e = earnings.data;
  const fmt = (cents: number) => money(cents, me.data?.currency, me.data?.locale);
  const basis =
    e.pay.type === "PERCENT_OF_JOB"
      ? `${(e.pay.percentBps ?? 0) / 100}% of each job (pre-tax)`
      : e.pay.type === "HOURLY"
        ? `${fmt(e.pay.rateCents ?? 0)}/hour on checked-in time`
        : `${fmt(e.pay.rateCents ?? 0)} per job`;
  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={earnings.isRefetching}
          onRefresh={() => void earnings.refetch()}
        />
      }
    >
      <T variant="muted">Paid {basis}. Tips are passed through 100%.</T>
      <Row>
        <Card style={{ flex: 1 }}>
          <T variant="small">This week</T>
          <T variant="big">{fmt(e.weekCents)}</T>
        </Card>
        <Card style={{ flex: 1 }}>
          <T variant="small">Last 30 days</T>
          <T variant="big">{fmt(e.last30Cents)}</T>
        </Card>
      </Row>
      {e.items.length === 0 ? (
        <T variant="muted">Complete your first job to see earnings here.</T>
      ) : null}
      {e.items.map((i) => (
        <Card key={i.id}>
          <Row style={{ justifyContent: "space-between" }}>
            <T variant="heading">
              {dayLabel(i.scheduledDate, me.data?.locale)} · {i.serviceName}
            </T>
            <T variant="heading">{fmt(i.totalCents)}</T>
          </Row>
          <T variant="small">
            {i.customer} · {i.bookingNumber} · {i.basis.replaceAll("_", " ").toLowerCase()}
            {i.tipCents ? ` · tip ${fmt(i.tipCents)}` : ""} · {i.status.toLowerCase()}
          </T>
        </Card>
      ))}
    </Screen>
  );
}
