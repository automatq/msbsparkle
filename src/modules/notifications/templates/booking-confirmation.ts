import { formatCents } from "@/modules/shared/money";

export type BookingConfirmationData = {
  brand: string;
  firstName: string;
  bookingNumber: string;
  serviceName: string;
  dateLabel: string;
  windowLabel: string;
  addressLine: string;
  frequencyLabel: string;
  totalCents: number;
  manageUrl: string;
  supportPhone?: string;
};

export function bookingConfirmationEmail(d: BookingConfirmationData): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Your ${d.brand} cleaning is booked: ${d.dateLabel}, ${d.windowLabel}`;
  const rows: [string, string][] = [
    ["Booking", d.bookingNumber],
    ["Service", d.serviceName],
    ["When", `${d.dateLabel}, arrival ${d.windowLabel}`],
    ["Where", d.addressLine],
    ["Frequency", d.frequencyLabel],
    ["Total for first clean", `${formatCents(d.totalCents)} (charged after service)`],
  ];
  const text = [
    `Hi ${d.firstName},`,
    ``,
    `You're booked. Here are the details:`,
    ...rows.map(([k, v]) => `${k}: ${v}`),
    ``,
    `Manage your booking: ${d.manageUrl}`,
    `Need to reschedule? Changes are free up to 24 hours before your arrival window.`,
    d.supportPhone ? `Questions? Call ${d.supportPhone}.` : "",
    ``,
    d.brand,
  ].join("\n");
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111">
    <h1 style="font-size:20px">You're booked, ${escapeHtml(d.firstName)}!</h1>
    <table style="border-collapse:collapse;width:100%;font-size:14px">
      ${rows.map(([k, v]) => `<tr><td style="padding:6px 0;color:#666;width:40%">${escapeHtml(k)}</td><td style="padding:6px 0">${escapeHtml(v)}</td></tr>`).join("")}
    </table>
    <p style="margin:20px 0"><a href="${d.manageUrl}" style="background:#111;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Manage booking</a></p>
    <p style="font-size:13px;color:#666">Changes are free up to 24 hours before your arrival window. No payment is taken until the clean is complete.</p>
    <p style="font-size:13px;color:#666">${escapeHtml(d.brand)}${d.supportPhone ? ` · ${escapeHtml(d.supportPhone)}` : ""}</p>
  </div>`;
  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}
