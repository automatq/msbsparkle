// Runs during `vercel-build`, before `next build`: applies migrations and the idempotent seed
// (organization + catalog; never demo data or admins in production).
//
// Production deployments always migrate. Preview deployments only do when MIGRATE_ON_PREVIEW=1,
// which is meant for setups where each preview gets its own database branch (Neon branching):
// otherwise a pull request's unmerged migration could change the production database.
import { execSync } from "node:child_process";

const env = process.env.VERCEL_ENV ?? "local";
const hasDb = !!(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL);
const allowed =
  env === "production" || (env === "preview" && process.env.MIGRATE_ON_PREVIEW === "1");

if (!hasDb) {
  console.log("[deploy-db] No DATABASE_URL: skipping migrations and seed.");
} else if (!allowed) {
  console.log(
    `[deploy-db] ${env} deployment: skipping migrations (set MIGRATE_ON_PREVIEW=1 to enable).`,
  );
} else {
  // NODE_ENV is forced so the seed never adds the demo company (with its well-known admin
  // password) to a deployed database, whatever the build environment sets.
  const run = (cmd) => {
    console.log(`[deploy-db] ${cmd}`);
    execSync(cmd, { stdio: "inherit", env: { ...process.env, NODE_ENV: "production" } });
  };
  run("prisma migrate deploy");
  run("tsx prisma/seed.ts");
}
