import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Migrations need a direct connection; Neon's Vercel integration provides it as
    // DATABASE_URL_UNPOOLED (DATABASE_URL is the pooled one the app uses).
    url:
      process.env.DATABASE_URL_UNPOOLED ||
      process.env.DATABASE_URL ||
      "postgresql://sparkle:sparkle@localhost:5432/sparkle?schema=public",
    // Used by `prisma migrate diff --from-migrations` (CI drift check) and `migrate dev`.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
