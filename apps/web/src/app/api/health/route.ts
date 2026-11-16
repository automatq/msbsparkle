import { prisma } from "@/modules/db/client";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true, db: "up" });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "db down" },
      { status: 503 },
    );
  }
}
