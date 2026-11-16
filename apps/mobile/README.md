# Cleaner app (Expo)

The cleaner mobile app: sign in with a texted code, see offers and the day's jobs, go "On my way" (live tracking for the customer), check in, tick the checklist, take photos, check out, and see earnings and availability. It talks to the web app's `/api/mobile/v1` (contract in `packages/shared/src/mobile-api.ts`).

Expo SDK 58, expo-router, TanStack Query. Background location and push need a **development build**; they don't work in Expo Go.

## Run it

```bash
pnpm install                                   # from the repo root
pnpm --filter web dev                          # the API, http://localhost:3000
cd apps/mobile
EXPO_PUBLIC_API_URL=http://192.168.1.20:3000 pnpm start   # your computer's LAN IP; 10.0.2.2 for the Android emulator
```

Then open the development build on a device or emulator (build one with `eas build --profile development`, or `pnpm android` / `pnpm ios` with Android Studio / Xcode installed). Seeded cleaners sign in with 416 555 1000–1004; the code lands in Mailpit (http://localhost:8025).

Checks: `pnpm --filter mobile typecheck`, `lint`, `test` (Vitest for the plain-TS modules: API client, photo queue). The root `pnpm typecheck|lint|test` include the app.

## One app per company

Like the web app, the cleaner app is built per company. Everything company-specific is set at build time (see `app.config.ts`):

| Variable         | Example                         |
| ---------------- | ------------------------------- |
| `APP_NAME`       | `MSB Sparkle Cleaner`           |
| `APP_ID`         | `com.msbsparkle.cleaner`        |
| `APP_SCHEME`     | `msbsparkle-cleaner`            |
| `API_URL`        | `https://msbsparkle.vercel.app` |
| `EAS_PROJECT_ID` | from `eas init`                 |

`eas.json` has `development`, `preview` (internal testing) and `production` profiles; set the variables per profile or as EAS environment variables.

## First release checklist

1. `npm i -g eas-cli`, `eas login`, then `eas init` in `apps/mobile` and set `EAS_PROJECT_ID`.
2. Accounts: Apple Developer Program ($99/yr) and Google Play Console ($25 once).
3. Push: `eas credentials` sets up APNs (iOS) and FCM (Android). On the server set `PUSH_DELIVERY=expo` (default in production) and, if you turn on enhanced push security in Expo, `EXPO_ACCESS_TOKEN`.
4. Maps (optional but recommended): `MAPBOX_ACCESS_TOKEN` and `NEXT_PUBLIC_MAPBOX_TOKEN` on the web deployment.
5. `eas build --profile preview` and test on real phones: sign in, accept an offer, On my way (watch `/track/<token>` on another device), check in, photos, check out.
6. `eas build --profile production` then `eas submit`.

## Store review notes (drafts)

**Background location (App Store "Always" location, Play Console background location declaration):**

> Cleaners tap "On my way" when they leave for a customer's home. From then until they check in at the address, the app shares their location so the customer can see the cleaner's estimated arrival time and position on a live tracking page. Location is not collected at any other time: tracking stops automatically at check-in, when the job is cancelled or reassigned, or when the cleaner signs out. On Android a persistent notification ("Sharing your location with the customer") is shown while it runs. Location history is deleted after 7 days.

Play Console also asks for a short video showing the "On my way" button, the permission prompt and the foreground notification.

**Data collected (App Privacy / Data safety):**

- Precise location: app functionality (customer arrival tracking), only between "On my way" and check-in; linked to the cleaner; not used for tracking across apps; deleted after 7 days.
- Photos: app functionality (job before/after photos); deleted after 90 days.
- Phone number: account sign-in.
- Device push token: notifications.
- No advertising, no third-party analytics in the app.

**Sign-in for reviewers:** give Apple/Google a demo cleaner number whose code is delivered to an inbox you control, or a review build pointed at a staging deployment.
