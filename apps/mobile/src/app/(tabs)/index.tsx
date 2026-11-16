import { Link } from "expo-router";
import { Pressable, RefreshControl } from "react-native";
import type { JobSummary } from "@msb/shared/mobile-api";
import { useJobs, useMe } from "@/api/hooks";
import { Badge, Card, ErrorView, Loading, Row, Screen, Section, T } from "@/components/ui";
import { dayLabel } from "@/lib/format";

const CLOSED = ["COMPLETED", "NO_SHOW"];

function JobCard({ job, locale }: { job: JobSummary; locale?: string }) {
  return (
    <Link href={{ pathname: "/jobs/[id]", params: { id: job.jobId } }} asChild>
      <Pressable accessibilityRole="button" testID={`job-${job.jobId}`}>
        <Card>
          <Row style={{ justifyContent: "space-between" }}>
            <T variant="heading">
              {job.windowStartLocal}–{job.windowEndLocal} · {dayLabel(job.scheduledDate, locale)}
            </T>
            <Badge status={job.assignmentStatus === "OFFERED" ? "OFFER" : job.jobStatus} />
          </Row>
          <T>
            {job.serviceName} · {job.area.line1}, {job.area.city}
          </T>
          <T variant="small">
            {job.bookingNumber} · ~{Math.round((job.estimatedMinutes / 60) * 10) / 10}h
            {job.teammates.length ? ` · with ${job.teammates.join(", ")}` : ""}
          </T>
        </Card>
      </Pressable>
    </Link>
  );
}

/** Offers, today, upcoming and recent, like the web portal's home. */
export default function Today() {
  const jobs = useJobs();
  const me = useMe();
  if (jobs.isPending) return <Loading />;
  if (jobs.isError) return <ErrorView error={jobs.error} onRetry={() => jobs.refetch()} />;

  const { today, jobs: all } = jobs.data;
  const locale = me.data?.locale;
  const offers = all.filter((j) => j.assignmentStatus === "OFFERED");
  const accepted = all.filter((j) => j.assignmentStatus === "ACCEPTED");
  const todays = accepted.filter((j) => j.scheduledDate === today);
  const upcoming = accepted.filter((j) => j.scheduledDate > today && !CLOSED.includes(j.jobStatus));
  const recent = accepted
    .filter(
      (j) => j.scheduledDate < today || (j.scheduledDate === today && CLOSED.includes(j.jobStatus)),
    )
    .filter((j) => CLOSED.includes(j.jobStatus))
    .slice(-5)
    .reverse();

  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={jobs.isRefetching} onRefresh={() => void jobs.refetch()} />
      }
    >
      <T variant="title">{me.data ? `Hi ${me.data.firstName}` : "Today"}</T>
      {offers.length ? (
        <Section title="New offers">
          {offers.map((j) => (
            <JobCard key={j.jobId} job={j} locale={locale} />
          ))}
        </Section>
      ) : null}
      <Section title="Today">
        {todays.length ? (
          todays.map((j) => <JobCard key={j.jobId} job={j} locale={locale} />)
        ) : (
          <T variant="muted">No jobs today.</T>
        )}
      </Section>
      {upcoming.length ? (
        <Section title="Upcoming">
          {upcoming.map((j) => (
            <JobCard key={j.jobId} job={j} locale={locale} />
          ))}
        </Section>
      ) : null}
      {recent.length ? (
        <Section title="Recent">
          {recent.map((j) => (
            <JobCard key={j.jobId} job={j} locale={locale} />
          ))}
        </Section>
      ) : null}
    </Screen>
  );
}
