import { formatCents } from "@/modules/shared/money";

export { bookingConfirmationEmail } from "./booking-confirmation";

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
const wrap = (title: string, body: string, brand: string) =>
  `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111"><h1 style="font-size:20px">${esc(title)}</h1>${body}<p style="font-size:13px;color:#666;margin-top:24px">${esc(brand)}</p></div>`;
const btn = (href: string, label: string) =>
  `<p style="margin:20px 0"><a href="${href}" style="background:#111;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">${esc(label)}</a></p>`;

export type Msg = {
  subject: string;
  html: string;
  text: string;
  sms: string;
  /** For the cleaner app. `data.jobId` makes a tap open that job. */
  push?: { title: string; body: string; data?: Record<string, string> };
};

export function reminderTemplate(d: {
  brand: string;
  firstName: string;
  when: string;
  windowLabel: string;
  serviceName: string;
  cleanerName: string | null;
  daysOut: 3 | 1;
  manageUrl: string;
  totalCents: number;
}): Msg {
  const lead = d.daysOut === 3 ? "in 3 days" : "tomorrow";
  const subject = `Reminder: your ${d.brand} clean is ${lead} (${d.when}, ${d.windowLabel})`;
  const cleaner = d.cleanerName
    ? `Your cleaner: ${d.cleanerName}.`
    : "Your cleaner will be confirmed soon.";
  const text = `Hi ${d.firstName}, your ${d.serviceName} is ${lead}: ${d.when}, arrival ${d.windowLabel}. ${cleaner} Total ${formatCents(d.totalCents)}, charged after the clean. Need changes? ${d.manageUrl} (free until 24h before).`;
  const html = wrap(
    `Your clean is ${lead}`,
    `<p>${esc(d.serviceName)} · <b>${esc(d.when)}</b>, arrival ${esc(d.windowLabel)}.</p><p>${esc(cleaner)}</p><p>Total ${formatCents(d.totalCents)}, charged after the clean is complete.</p>${btn(d.manageUrl, "Manage booking")}<p style="font-size:13px;color:#666">Changes are free up to 24 hours before your arrival window.</p>`,
    d.brand,
  );
  const sms = `${d.brand}: your ${d.serviceName} is ${lead}, ${d.when} ${d.windowLabel}. ${d.cleanerName ? `Cleaner: ${d.cleanerName}. ` : ""}Manage: ${d.manageUrl} Reply STOP to opt out.`;
  return { subject, html, text, sms };
}

export function cleanerAssignedTemplate(d: {
  brand: string;
  jobId: string;
  firstName: string;
  offered: boolean;
  when: string;
  windowLabel: string;
  serviceName: string;
  area: string;
  jobUrl: string;
}): Msg {
  const subject = d.offered
    ? `New job offer: ${d.when} ${d.windowLabel}`
    : `New job: ${d.when} ${d.windowLabel}`;
  const text = `Hi ${d.firstName}, ${d.offered ? "you have a new job offer" : "you've been assigned a job"}: ${d.serviceName} in ${d.area}, ${d.when}, arrival ${d.windowLabel}. ${d.offered ? "Accept or decline: " : "Details: "}${d.jobUrl}`;
  const html = wrap(
    subject,
    `<p>${esc(d.serviceName)} in ${esc(d.area)}</p><p><b>${esc(d.when)}</b>, arrival ${esc(d.windowLabel)}</p>${btn(d.jobUrl, d.offered ? "Accept or decline" : "View job")}`,
    d.brand,
  );
  const sms = `${d.brand}: ${d.offered ? "job offer" : "new job"} ${d.when} ${d.windowLabel}, ${d.serviceName} in ${d.area}. ${d.jobUrl}`;
  const push = {
    title: d.offered ? "New job offer" : "New job",
    body: `${d.when}, ${d.windowLabel} · ${d.serviceName} in ${d.area}${d.offered ? ". Tap to accept or decline." : ""}`,
    data: { jobId: d.jobId, kind: d.offered ? "offer" : "assigned" },
  };
  return { subject, html, text, sms, push };
}

export type CleanerJobChange = "cancelled" | "rescheduled" | "removed";

/** Tells a cleaner a job they had was cancelled, moved, or taken off their schedule. */
export function cleanerJobChangedTemplate(d: {
  brand: string;
  jobId: string;
  firstName: string;
  change: CleanerJobChange;
  when: string; // the (new, for rescheduled) date
  windowLabel: string;
  serviceName: string;
  area: string;
  previousWhen?: string;
  jobUrl: string;
  scheduleUrl: string;
}): Msg {
  const what = `${d.serviceName} in ${d.area}`;
  const line =
    d.change === "cancelled"
      ? `Your ${d.when} job (${what}) was cancelled.`
      : d.change === "removed"
        ? `You're no longer on the ${d.when} job (${what}).`
        : `Your job (${what}) moved${d.previousWhen ? ` from ${d.previousWhen}` : ""} to ${d.when}, arrival ${d.windowLabel}.`;
  const title =
    d.change === "cancelled"
      ? "Job cancelled"
      : d.change === "removed"
        ? "Removed from a job"
        : "Job rescheduled";
  const link = d.change === "rescheduled" ? d.jobUrl : d.scheduleUrl;
  const subject = `${title}: ${d.when}`;
  const text = `Hi ${d.firstName}, ${line} ${link}`;
  const html = wrap(
    title,
    `<p>${esc(line)}</p>${btn(link, d.change === "rescheduled" ? "View job" : "Your schedule")}`,
    d.brand,
  );
  return {
    subject,
    html,
    text,
    sms: `${d.brand}: ${line}`,
    push: {
      title,
      body: line,
      data: d.change === "rescheduled" ? { jobId: d.jobId, kind: d.change } : { kind: d.change },
    },
  };
}

/** Tells a cleaner what happened to their time off (decided, added or removed by dispatch). */
export function cleanerTimeOffTemplate(d: {
  brand: string;
  firstName: string;
  kind: "approved" | "denied" | "added" | "removed";
  from: string; // YYYY-MM-DD
  to: string;
  url: string;
}): Msg {
  const days = d.from === d.to ? d.from : `${d.from} to ${d.to}`;
  const title = {
    approved: "Time off approved",
    denied: "Time off not approved",
    added: "Time off added",
    removed: "Time off removed",
  }[d.kind];
  const line = {
    approved: `Your time off for ${days} is approved. You won't be scheduled then.`,
    denied: `Your time-off request for ${days} wasn't approved. Talk to your dispatcher if you need it.`,
    added: `Your dispatcher added time off for you: ${days}. You won't be scheduled then.`,
    removed: `Your time off for ${days} was removed, so you can be scheduled again.`,
  }[d.kind];
  return {
    subject: `${title}: ${days}`,
    html: wrap(
      title,
      `<p>Hi ${esc(d.firstName)}, ${esc(line)}</p>${btn(d.url, "Your availability")}`,
      d.brand,
    ),
    text: `Hi ${d.firstName}, ${line} ${d.url}`,
    sms: `${d.brand}: ${line}`,
    push: { title, body: line, data: { kind: "time_off" } },
  };
}

/** Day-before reminder for the cleaner, pushed to the app (SMS when they have no app). */
export function cleanerReminderTemplate(d: {
  brand: string;
  jobId: string;
  when: string;
  windowLabel: string;
  serviceName: string;
  area: string;
}): Msg {
  const body = `Tomorrow ${d.windowLabel}: ${d.serviceName} in ${d.area}.`;
  return {
    subject: `Tomorrow: ${d.serviceName} in ${d.area}`,
    html: "",
    text: body,
    sms: `${d.brand}: ${body}`,
    push: { title: "Job tomorrow", body, data: { jobId: d.jobId, kind: "reminder" } },
  };
}

export function paymentFailedTemplate(d: {
  brand: string;
  firstName: string;
  when: string;
  amountCents: number;
  reason: string | null;
  paymentUrl: string;
  supportPhone?: string;
}): Msg {
  const subject = `Action needed: payment for your ${d.when} clean didn't go through`;
  const text = `Hi ${d.firstName}, we couldn't charge ${formatCents(d.amountCents)} for your clean on ${d.when}${d.reason ? ` (${d.reason})` : ""}. Please update your card: ${d.paymentUrl}. We'll retry automatically.${d.supportPhone ? ` Questions? ${d.supportPhone}` : ""}`;
  const html = wrap(
    "Payment didn't go through",
    `<p>We couldn't charge <b>${formatCents(d.amountCents)}</b> for your clean on ${esc(d.when)}${d.reason ? ` (${esc(d.reason)})` : ""}.</p>${btn(d.paymentUrl, "Update card")}<p style="font-size:13px;color:#666">We'll retry automatically over the next week. Recurring visits are paused until a payment succeeds.</p>`,
    d.brand,
  );
  const sms = `${d.brand}: payment of ${formatCents(d.amountCents)} for your ${d.when} clean failed. Update your card: ${d.paymentUrl}`;
  return { subject, html, text, sms };
}

export function paymentActionTemplate(d: {
  brand: string;
  firstName: string;
  when: string;
  amountCents: number;
  confirmUrl: string;
}): Msg {
  const subject = `Please confirm the payment for your ${d.when} clean`;
  const text = `Hi ${d.firstName}, your bank needs you to confirm the ${formatCents(d.amountCents)} payment for your clean on ${d.when}. Confirm it here: ${d.confirmUrl}`;
  const html = wrap(
    "Your bank needs a quick confirmation",
    `<p>Your bank asked you to confirm the <b>${formatCents(d.amountCents)}</b> payment for your clean on ${esc(d.when)}. It only takes a moment.</p>${btn(d.confirmUrl, "Confirm payment")}`,
    d.brand,
  );
  const sms = `${d.brand}: your bank needs you to confirm the ${formatCents(d.amountCents)} payment for your ${d.when} clean: ${d.confirmUrl}`;
  return { subject, html, text, sms };
}

export function receiptTemplate(d: {
  brand: string;
  firstName: string;
  when: string;
  serviceName: string;
  amountCents: number;
  tipCents: number;
  last4: string | null;
  receiptsUrl: string;
}): Msg {
  const subject = `Receipt: ${formatCents(d.amountCents + d.tipCents)} for your ${d.when} clean`;
  const text = `Hi ${d.firstName}, we charged ${formatCents(d.amountCents)}${d.tipCents ? ` plus a ${formatCents(d.tipCents)} tip` : ""}${d.last4 ? ` to your card ending ${d.last4}` : ""} for ${d.serviceName} on ${d.when}. Receipts: ${d.receiptsUrl}`;
  const html = wrap(
    "Thanks for choosing us",
    `<p>${esc(d.serviceName)} · ${esc(d.when)}</p><p>Charged <b>${formatCents(d.amountCents)}</b>${d.tipCents ? ` + ${formatCents(d.tipCents)} tip` : ""}${d.last4 ? ` to card ending ${esc(d.last4)}` : ""}.</p>${btn(d.receiptsUrl, "View receipts")}`,
    d.brand,
  );
  return { subject, html, text, sms: "" };
}

export function reviewRequestTemplate(d: {
  brand: string;
  firstName: string;
  cleanerName: string | null;
  accountUrl: string;
}): Msg {
  const subject = `How was your clean${d.cleanerName ? ` with ${d.cleanerName}` : ""}?`;
  const text = `Hi ${d.firstName}, how did we do? Rate your clean and leave a tip if you'd like (100% goes to your cleaner): ${d.accountUrl}`;
  const html = wrap(
    subject,
    `<p>It takes 10 seconds and helps ${d.cleanerName ? esc(d.cleanerName) : "your cleaner"} directly.</p>${btn(d.accountUrl, "Rate your clean")}`,
    d.brand,
  );
  const sms = `${d.brand}: how was your clean${d.cleanerName ? ` with ${d.cleanerName}` : ""}? Rate it here: ${d.accountUrl}`;
  return { subject, html, text, sms };
}

export function adminDigestTemplate(d: {
  brand: string;
  date: string;
  rows: {
    region: string;
    jobs: number;
    unassigned: number;
    completedYesterday: number;
    failedPayments: number;
    /** Completed over a day ago with no charge attempt at all. */
    unbilled: number;
  }[];
  adminUrl: string;
}): Msg {
  const subject = `${d.brand} daily digest · ${d.date}`;
  const lines = d.rows.map(
    (r) =>
      `${r.region}: ${r.jobs} jobs today, ${r.unassigned} unassigned, ${r.completedYesterday} completed yesterday, ${r.failedPayments} failed payments${r.unbilled ? `, ${r.unbilled} completed but never billed` : ""}`,
  );
  const text = [`Digest for ${d.date}`, ...lines, `Dispatch: ${d.adminUrl}`].join("\n");
  const html = wrap(
    `Daily digest · ${d.date}`,
    `<table style="border-collapse:collapse;font-size:14px;width:100%"><tr><th align="left">Region</th><th>Jobs today</th><th>Unassigned</th><th>Done yesterday</th><th>Failed payments</th><th>Never billed</th></tr>${d.rows.map((r) => `<tr><td>${esc(r.region)}</td><td align="center">${r.jobs}</td><td align="center" style="${r.unassigned ? "color:#b45309;font-weight:bold" : ""}">${r.unassigned}</td><td align="center">${r.completedYesterday}</td><td align="center" style="${r.failedPayments ? "color:#b91c1c;font-weight:bold" : ""}">${r.failedPayments}</td><td align="center" style="${r.unbilled ? "color:#b91c1c;font-weight:bold" : ""}">${r.unbilled}</td></tr>`).join("")}</table>${btn(d.adminUrl, "Open dispatch")}`,
    d.brand,
  );
  return { subject, html, text, sms: "" };
}

export type TrackingKind = "en_route" | "arriving" | "late";

/** Customer updates while the cleaner is on the way, each with the live tracking link. */
export function customerTrackingTemplate(d: {
  brand: string;
  kind: TrackingKind;
  customerFirstName: string;
  cleanerFirstName: string;
  eta: string | null; // "10:25 AM"
  trackUrl: string;
}): Msg {
  const line =
    d.kind === "arriving"
      ? `${d.cleanerFirstName} is arriving now.`
      : d.kind === "late"
        ? `${d.cleanerFirstName} is running a little late${d.eta ? ` and should arrive around ${d.eta}` : ""}. Sorry for the wait!`
        : `${d.cleanerFirstName} is on the way${d.eta ? `, arriving around ${d.eta}` : ""}.`;
  const title =
    d.kind === "arriving"
      ? "Your cleaner is arriving"
      : d.kind === "late"
        ? "Your cleaner is running late"
        : "Your cleaner is on the way";
  return {
    subject: `${title}${d.eta && d.kind !== "arriving" ? ` (around ${d.eta})` : ""}`,
    html: wrap(
      title,
      `<p>Hi ${esc(d.customerFirstName)}, ${esc(line)}</p>${btn(d.trackUrl, "Track live")}`,
      d.brand,
    ),
    text: `Hi ${d.customerFirstName}, ${line} Track live: ${d.trackUrl}`,
    sms: `${d.brand}: ${line} Track: ${d.trackUrl}`,
  };
}

/** Invitation to the admin team, or a password reset: one link where they choose a password. */
export function adminPasswordLinkTemplate(d: {
  brand: string;
  name: string | null;
  kind: "invite" | "reset";
  link: string;
  invitedBy: string | null;
  validFor: string;
}): Msg {
  const hi = d.name ? `Hi ${d.name.split(" ")[0]},` : "Hi,";
  const invite = d.kind === "invite";
  const title = invite
    ? `You're invited to ${d.brand} admin`
    : `Reset your ${d.brand} admin password`;
  const line = invite
    ? `${d.invitedBy ?? "A teammate"} added you to the ${d.brand} admin team. Choose a password to get started.`
    : `Use the link below to choose a new password. If you didn't ask for this, ignore this email and your password stays the same.`;
  const note = `The link works once and expires in ${d.validFor}.`;
  return {
    subject: title,
    html: wrap(
      title,
      `<p>${esc(hi)} ${esc(line)}</p>${btn(d.link, invite ? "Choose your password" : "Reset password")}<p style="font-size:13px;color:#666">${esc(note)}</p>`,
      d.brand,
    ),
    text: `${hi} ${line}\n\n${d.link}\n\n${note}`,
    sms: "",
  };
}
