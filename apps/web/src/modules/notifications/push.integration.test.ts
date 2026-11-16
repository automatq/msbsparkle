/**
 * Push notification integration tests against the local database. Expo is never called: delivery
 * runs in "log" mode, or against a stubbed fetch where the Expo responses matter.
 * Skipped when DATABASE_URL is unset.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createMobileSession, getMobileAuth, revokeSessionById } from "@/modules/auth/mobile";
import { cleanerFixtures } from "@/modules/cleaner/test-fixtures";
import { prisma } from "@/modules/db/client";
import { notifyCleanerAssigned, notifyCleanerJobChanged } from "@/modules/jobs/tasks/notify";
import { runReminders } from "@/modules/jobs/tasks/reminders";
import { activePushDevices, runPushReceipts, sendPush } from "./push";

const enabled = !!process.env.DATABASE_URL;
const tag = `push${Date.now().toString(36)}`;
const fx = cleanerFixtures(tag, 8000);
let tokenN = 0;

/** A signed-in cleaner with one registered device. */
async function cleanerWithDevice() {
  const c = await fx.makeCleaner();
  const tokens = await createMobileSession(c.userId!, { name: "Phone", platform: "ios" });
  const auth = await getMobileAuth({
    headers: new Headers({ authorization: `Bearer ${tokens.accessToken}` }),
  });
  const expoPushToken = `ExponentPushToken[${tag}-${tokenN++}]`;
  await prisma.pushDevice.create({
    data: { userId: c.userId!, mobileSessionId: auth!.sessionId, expoPushToken, platform: "ios" },
  });
  return { cleaner: c, sessionId: auth!.sessionId, expoPushToken };
}

const base = (c: { id: string; organizationId: string }) => ({
  templateKey: "test.push",
  organizationId: c.organizationId,
  recipientType: "CLEANER" as const,
  recipientId: c.id,
});

describe.skipIf(!enabled)("push notifications (integration)", () => {
  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  afterAll(fx.cleanup);

  it("sends once per device and dedupes retries", async () => {
    const { cleaner } = await cleanerWithDevice();
    const msg = {
      ...base(cleaner),
      userId: cleaner.userId!,
      payload: { title: "Hi", body: "Test" },
      dedupeKey: `${tag}:once`,
    };
    expect(await sendPush(msg)).toBe(1);
    expect(await sendPush(msg)).toBe(1); // already reached: counts, but doesn't resend
    const rows = await prisma.notification.findMany({
      where: { recipientId: cleaner.id, channel: "PUSH" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("SENT");
  });

  it("skips devices whose session ended", async () => {
    const { cleaner, sessionId } = await cleanerWithDevice();
    await revokeSessionById(sessionId, "test");
    expect(await activePushDevices(cleaner.userId!)).toHaveLength(0);
    expect(
      await sendPush({
        ...base(cleaner),
        userId: cleaner.userId!,
        payload: { title: "x", body: "y" },
      }),
    ).toBe(0);
  });

  it("disables a token Expo reports as unregistered, at send and at receipt time", async () => {
    vi.stubEnv("PUSH_DELIVERY", "expo");
    const a = await cleanerWithDevice();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          data: [
            {
              status: "error",
              message: "not registered",
              details: { error: "DeviceNotRegistered" },
            },
          ],
        }),
      ),
    );
    expect(
      await sendPush({
        ...base(a.cleaner),
        userId: a.cleaner.userId!,
        payload: { title: "x", body: "y" },
      }),
    ).toBe(0);
    const dead = await prisma.pushDevice.findUniqueOrThrow({
      where: { expoPushToken: a.expoPushToken },
    });
    expect(dead.disabledReason).toBe("DeviceNotRegistered");

    // Accepted at send time, rejected in the receipt.
    const b = await cleanerWithDevice();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ data: [{ status: "ok", id: `${tag}-ticket` }] })),
    );
    expect(
      await sendPush({
        ...base(b.cleaner),
        userId: b.cleaner.userId!,
        payload: { title: "x", body: "y" },
      }),
    ).toBe(1);
    await prisma.notification.updateMany({
      where: { providerMessageId: `${tag}-ticket` },
      data: { sentAt: new Date(Date.now() - 60 * 60_000) },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          data: {
            [`${tag}-ticket`]: {
              status: "error",
              message: "gone",
              details: { error: "DeviceNotRegistered" },
            },
          },
        }),
      ),
    );
    const receipts = await runPushReceipts();
    expect(receipts.failed).toBeGreaterThanOrEqual(1);
    expect(
      (await prisma.pushDevice.findUniqueOrThrow({ where: { expoPushToken: b.expoPushToken } }))
        .disabledAt,
    ).not.toBeNull();
    expect(
      (
        await prisma.notification.findFirstOrThrow({
          where: { providerMessageId: `${tag}-ticket` },
        })
      ).status,
    ).toBe("FAILED");
  });

  it("job offers go by push and email; SMS only for cleaners without the app", async () => {
    const withApp = await cleanerWithDevice();
    const { job: j1 } = await fx.makeJob(withApp.cleaner.id, "OFFERED", { daysAhead: 2 });
    await notifyCleanerAssigned(j1.id, withApp.cleaner.id, true);
    const sent1 = await prisma.notification.findMany({
      where: { recipientId: withApp.cleaner.id, templateKey: "cleaner.offered" },
    });
    expect(sent1.map((n) => n.channel).sort()).toEqual(["EMAIL", "PUSH"]);

    const noApp = await fx.makeCleaner();
    const { job: j2 } = await fx.makeJob(noApp.id, "OFFERED", { daysAhead: 2 });
    await notifyCleanerAssigned(j2.id, noApp.id, true);
    const sent2 = await prisma.notification.findMany({
      where: { recipientId: noApp.id, templateKey: "cleaner.offered" },
    });
    expect(sent2.map((n) => n.channel).sort()).toEqual(["EMAIL", "SMS"]);
  });

  it("tells a cleaner about a cancelled job once, and ignores past jobs", async () => {
    const { cleaner } = await cleanerWithDevice();
    const { job } = await fx.makeJob(cleaner.id, "ACCEPTED", { daysAhead: 3 });
    expect(
      await notifyCleanerJobChanged(job.id, cleaner.id, "cancelled", { nonce: "cancel" }),
    ).toEqual({
      sent: true,
    });
    await notifyCleanerJobChanged(job.id, cleaner.id, "cancelled", { nonce: "cancel" });
    const pushes = await prisma.notification.findMany({
      where: { recipientId: cleaner.id, templateKey: "cleaner.cancelled", channel: "PUSH" },
    });
    expect(pushes).toHaveLength(1);
    expect((pushes[0].payload as { title: string }).title).toBe("Job cancelled");

    const { job: old } = await fx.makeJob(cleaner.id, "ACCEPTED", { daysAhead: -2 });
    expect(
      await notifyCleanerJobChanged(old.id, cleaner.id, "cancelled", { nonce: "cancel" }),
    ).toEqual({
      sent: false,
    });
  });

  it("reminds accepted cleaners the day before", async () => {
    const { cleaner } = await cleanerWithDevice();
    const { job } = await fx.makeJob(cleaner.id, "ACCEPTED", { daysAhead: 1 });
    const now = new Date(job.scheduledStartAt.getTime() - 24 * 3600_000);
    const first = await runReminders(now);
    expect(first.cleanerReminders).toBeGreaterThanOrEqual(1);
    const again = await runReminders(now);
    const rows = await prisma.notification.findMany({
      where: { recipientId: cleaner.id, templateKey: "cleaner.reminder_1d" },
    });
    expect(rows.map((r) => r.channel)).toEqual(["PUSH"]);
    expect(again.cleanerReminders).toBe(0);
  });
});
