import { NextResponse } from "next/server";
import { getOptionalCtx } from "@/modules/auth/session";
import { hasRole } from "@/modules/auth/roles";
import { chargeCompletedJob, runPaymentRetries } from "@/modules/jobs/tasks/charges";
import { runCutoff } from "@/modules/jobs/tasks/cutoff";
import { runAdminDigest } from "@/modules/jobs/tasks/digest";
import { sendReviewRequest } from "@/modules/jobs/tasks/notify";
import { runReminders } from "@/modules/jobs/tasks/reminders";
import { runSeriesMaterialization } from "@/modules/jobs/tasks/series";
import { runRetention } from "@/modules/jobs/tasks/retention";
import { runEarningsAutoApprove } from "@/modules/payouts/service";

export const runtime = "nodejs";

/**
 * Manual/cron trigger for background tasks. Authorized by CRON_SECRET (bearer) or a signed-in
 * super admin. Doubles as the Vercel Cron fallback if Inngest is not used.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  let allowed = !!secret && auth === `Bearer ${secret}`;
  if (!allowed) {
    const ctx = await getOptionalCtx();
    allowed = !!ctx && hasRole(ctx.roles, "SUPER_ADMIN");
  }
  if (!allowed) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    task?: string;
    jobId?: string;
    now?: string;
  };
  const now = body.now ? new Date(body.now) : new Date();
  switch (body.task) {
    case "reminders":
      return NextResponse.json(await runReminders(now));
    case "cutoff":
      return NextResponse.json(await runCutoff(now));
    case "series":
      return NextResponse.json(await runSeriesMaterialization(now));
    case "retries":
      return NextResponse.json(await runPaymentRetries(now));
    case "earnings":
      return NextResponse.json(await runEarningsAutoApprove(now));
    case "retention":
      return NextResponse.json(await runRetention(now));
    case "digest":
      return NextResponse.json(await runAdminDigest(now));
    case "charge":
      return NextResponse.json(
        body.jobId ? await chargeCompletedJob(body.jobId) : { error: "jobId required" },
      );
    case "review":
      return NextResponse.json(
        body.jobId ? await sendReviewRequest(body.jobId) : { error: "jobId required" },
      );
    default:
      return NextResponse.json(
        {
          error: "unknown task",
          tasks: [
            "reminders",
            "cutoff",
            "series",
            "retries",
            "digest",
            "retention",
            "charge",
            "review",
          ],
        },
        { status: 400 },
      );
  }
}
