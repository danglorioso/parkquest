# ParkQuest — guide for AI assistants

pnpm-workspaces monorepo:

- `apps/web` — Next.js App Router on Vercel. API routes double as the mobile app's backend.
- `apps/mobile` — Expo/React Native (iOS). TestFlight builds come from **Xcode Cloud**, not local archives; `ci_post_clone.sh` must provide env vars (a missing `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` once shipped a launch-crash build).
- `packages/types` — shared `@parkquest/types`.

## Commands

- Typecheck after every edit (the project's main verification loop):
  `cd apps/web && npx tsc --noEmit -p .` and `cd apps/mobile && npx tsc --noEmit -p .`
- Web dev server: `cd apps/web && pnpm dev` (port 3000).
- End-to-end API verification: use the `apps/web:verify` skill.

## Env & secrets

- Next.js reads **only `apps/web/.env.local`** — a root-level `.env.local` is ignored by the web app.
- Local Clerk keys must be the dev instance (`pk_test_`/`sk_test_`). Live keys (`pk_live_`/`sk_live_`) belong in Vercel only; the live secret key in a local env file is an incident waiting to happen (scripts here assume dev).
- Multiline PEM values in `.env.local` must be a quoted single line with `\n` escapes; code should normalize with `.replace(/\\n/g, '\n')` since Vercel's UI stores real newlines instead.
- Vercel CLI is linked at the **repo root** (`.vercel/`). Sensitive env vars cannot be pulled back out (`vercel env pull` returns them blank).

## Database (Neon Postgres + Drizzle)

- Schema: `apps/web/src/lib/db/schema.ts`.
- **Never run `drizzle-kit generate`/`push`** — migration journal is stale and push offers destructive TRUNCATEs. Hand-write SQL in `apps/web/scripts/*.mjs` (see `create-app-store-stats-table.mjs` for the pattern) and run with `node`.
- Local `.env.local` DATABASE_URL ≠ prod DB. Schema changes must be applied to each separately.
- The neon serverless driver returns `DATE` columns as full ISO timestamps. Any query whose day-keys a client compares as strings needs `to_char(..., 'YYYY-MM-DD')` — or better, zero-fill the series in SQL (`generate_series`) so the client never builds its own keys.
- User-facing timestamps/aggregations should use `America/New_York`, not raw UTC.

## Web gotchas

- Un-awaited async work is killed when Vercel freezes the response — wrap fire-and-forget calls (push sends, etc.) in `after()` from `next/server`.
- Admin surface: `requireAdmin()` (Clerk role) guards `/admin` pages and `/api/admin/*`.
- `user_profiles` rows are created reactively by `ensureUserProfile()` and proactively by the Clerk `user.created` webhook (`/api/webhooks/clerk`, needs `CLERK_WEBHOOK_SECRET` + Clerk Dashboard registration). Orphans (Clerk user, no row): `scripts/backfill-orphan-profiles.mjs`.
- Badges are one unified model: every badge is a `custom_badges` row. No built-in/custom split.

## Mobile gotchas

- `expo install` fails in this pnpm monorepo — `pnpm add` directly, and add new `expo-*` packages to `metro.config.js` `extraNodeModules`.
- `react-native-worklets` is pinned to 0.5.1 as a direct dependency (Expo Go compatibility). Don't let it float.
- `DynamicColorIOS` tokens crash inside `Reanimated`/`Animated` view styles ("Invalid color value") — dynamic colors go on an inner plain `View`.
- Animations: `useNativeDriver: true` for anything driven per-scroll-frame (transforms/opacity only — animating a layout prop forces the JS driver and stutters). Mid-animation mounting doesn't attach to native-driver animations; keep elements always-mounted and drive visibility with animated opacity.
- Never put Clerk's `getToken` in a React dependency array — an unstable identity once caused a 3.6M-invocation Vercel blowout. Use a ref.
- After adding native deps: `cd apps/mobile/ios && pod install` before archiving.
- Liquid Glass: `GlassView`s only sample each other inside a shared `GlassContainer`; set `borderRadius` on the `GlassView` itself (ancestor clips are ignored); use `glassEffectStyle="clear"` over photos, `"regular"` over flat surfaces (see `components/GlassIconBg.tsx`).

## Conventions

- Don't commit or push unless explicitly asked. Flag undeployed work — a fix isn't "live" until deployed (web) or shipped through TestFlight (mobile).
- Prefer editing existing patterns over introducing new dependencies.
