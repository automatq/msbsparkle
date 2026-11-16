# MSB Sparkle monorepo

pnpm workspace. Run scripts from the root (see README "Scripts").

- `apps/web`: the Next.js app. Read `apps/web/AGENTS.md` before changing it.
- `packages/shared` (`@msb/shared`): zod schemas and types shared by the apps. Pure TypeScript: never import Prisma, Next.js, `server-only` or anything from `apps/*`.

Shared dependency versions (`zod`, `typescript`, `vitest`) live in the `catalog:` in `pnpm-workspace.yaml`; reference them as `"catalog:"`.
