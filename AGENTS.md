# MSB Sparkle monorepo

pnpm workspace. Run scripts from the root (see README "Scripts").

- `apps/web`: the Next.js app. Read `apps/web/AGENTS.md` before changing it.
- `apps/mobile`: the cleaner app (Expo SDK 58, expo-router). It talks to `apps/web` only through `/api/mobile/v1`; request/response shapes live in `@msb/shared/mobile-api`. It keeps its own TypeScript version (Expo's template), not the catalog one.
- `packages/shared` (`@msb/shared`): zod schemas and types shared by the apps. Pure TypeScript: never import Prisma, Next.js, `server-only` or anything from `apps/*`.

Shared dependency versions (`zod`, `typescript`, `vitest`) live in the `catalog:` in `pnpm-workspace.yaml`; reference them as `"catalog:"`.
