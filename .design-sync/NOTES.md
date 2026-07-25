# ParkQuest UI primitives — design-sync notes

## Scope

Only `apps/web/src/components/ui/` (10 shadcn primitives) is synced —
**not** the other 29 files under `apps/web/src/components/`. Those are
Next.js/Clerk-coupled (17/39 import `next/link`, `next/navigation`, or
`@clerk/nextjs` directly) and won't render in this converter's plain
esbuild+React bundle. `apps/mobile` (React Native) is out of scope
entirely — this tool's preview pipeline is browser/DOM-only.

`componentSrcMap` in config.json lists only the **primary** export per
file (`Button`, `Card`, `AlertDialog`, `Calendar`, `Dialog`, `Form`,
`Input`, `Label`, `Popover`, `Skeleton`) — not every named sub-export
(`CardHeader`, `DialogContent`, `AlertDialogAction`, etc., ~50 total).
Those sub-parts ARE available on `window.ParkQuestUI.*` (the entry barrel
re-exports everything) and are used inside their parent's authored
preview, but deliberately don't get their own top-level DS card — that
would have produced ~50 near-duplicate cards for what are really just
compound-component internals. If the design agent needs a sub-part
addressable on its own, add it to `componentSrcMap` and re-run.

## Repo quirk: duplicate React installs (fixed via --node-modules)

This monorepo (`node-linker=hoisted` in `.npmrc`) has **two physical
copies of `react@19.2.3`** resolving to different real paths:
- `apps/web/node_modules/react` — a real directory (not a symlink)
- `node_modules/.pnpm/react@19.2.3/node_modules/react` — what
  `react-dom`'s peer-dependency resolution actually reaches

Root `node_modules/react` is *also* a separate real copy from both. Likely
caused by `apps/mobile` (Expo/RN) pinning a different React version
somewhere in the workspace, which makes pnpm's hoisted linker nest rather
than hoist react for `react-dom`'s peer resolution.

**Symptom:** components using hooks internally (Radix's `useScope`,
`react-day-picker`'s `useState`, `react-hook-form`'s `useRef`) threw
`TypeError: Cannot read properties of null (reading 'useMemo')` —
classic dual-React-instance dispatcher-null bug — even though simple
prop-only components (Button, Card, Input) rendered fine. Confirmed via
a throwaway Playwright script hitting the built `.html` directly and
reading `pageerror` stack traces.

**Fix:** point `--node-modules` at
`./node_modules/.pnpm/react-dom@19.2.3_react@19.2.3/node_modules` (the
directory react-dom's own peer resolution uses) instead of
`apps/web/node_modules`. This makes `vendorReact`'s outer
`require("react")` and react-dom's internal peer `require("react")`
resolve to the exact same file. Radix/react-hook-form/react-day-picker/
lucide-react/class-variance-authority/clsx/tailwind-merge still resolve
fine for the DS bundle + preview builds via esbuild's natural upward
node_modules walk from the real (symlink-resolved) source file paths —
`--node-modules` narrowing only affected the vendor React build.

**Re-sync risk:** if this repo's dependency tree changes (pnpm install,
version bumps, mobile's React pin changes), re-verify this path still
converges — re-run the debug snippet below if hooks break again:
```
node -e "console.log(require.resolve('react',{paths:[require.resolve('react-dom',{paths:['apps/web/node_modules']})]}))"
node -e "console.log(require.resolve('react',{paths:['apps/web/node_modules']}))"
```
If these two print the same path, the duplicate is gone and
`--node-modules apps/web/node_modules` can be used directly again.

## Synthetic package scaffold

There's no real `package.json`/`dist/` for `ui/` (it's app-internal, not a
publishable package), so this sync uses **synth-entry mode** via a
hand-built scratch package at `.design-sync/.cache/pkg-ui/` (gitignored,
regenerated every run):
- `package.json` — minimal, name `@parkquest/ui-primitives` (matches
  `cfg.pkg`)
- `button.tsx`, `card.tsx`, … — **symlinks** to the real files in
  `apps/web/src/components/ui/`
- `.ds-entry.tsx` — barrel re-exporting all 10 files (passed as `--entry`)
- `ds-styles.css` — compiled Tailwind output (see below)

`cfg.componentSrcMap` (not synth-entry auto-discovery) drives the
component list, since `--entry` being explicitly set short-circuits the
auto-discovery path in `lib/source-kit.mjs`.

**Regenerate before every build:**
```sh
mkdir -p .design-sync/.cache/pkg-ui
UI=apps/web/src/components/ui
for f in button card alert-dialog calendar dialog form input label popover skeleton; do
  ln -sf "$(pwd)/$UI/$f.tsx" ".design-sync/.cache/pkg-ui/$f.tsx"
done
# package.json + .ds-entry.tsx are static — see git history if lost
```

## Tailwind v4 CSS: needs `@source` for previews dir

`apps/web` uses Tailwind v4 (`@import "tailwindcss"` + `@theme inline` in
`globals.css`, JIT-compiled, no `tailwind.config.js`). The DS's `cssEntry`
(`ds-styles.css`) is a **compiled snapshot**, not a live Tailwind build —
it must be regenerated whenever `.design-sync/previews/*.tsx` add classes
Tailwind hasn't seen before. Tailwind v4's CLI auto-content-detection
scans from the CSS file's own project boundary (`apps/web`) and does
**not** reach up to sibling `.design-sync/` — classes used only in
authored previews (e.g. `bg-muted`, `h-[120px]`) silently don't compile
unless explicitly added as an extra source root:

```sh
cp apps/web/src/app/globals.css .design-sync/.cache/pkg-ui-globals.css
printf '\n@source "../previews";\n' >> .design-sync/.cache/pkg-ui-globals.css
npx -y @tailwindcss/cli@4 -i .design-sync/.cache/pkg-ui-globals.css \
  -o .design-sync/.cache/pkg-ui/ds-styles.css --cwd .
```
Re-run this **before every `package-build.mjs`** if `previews/` changed —
the build doesn't do it for you (`cssEntry` is just copied verbatim).

## Known gap: brand fonts not shipped

`apps/web` loads Archivo + JetBrains Mono via `next/font/google`
(self-hosted at Next.js build time — not available as static files
pre-build, not a runtime CDN load either, so neither `extraFonts` nor
`runtimeFontPrefixes` cleanly applies). `package-validate.mjs` never
printed `[FONT_MISSING]` because the compiled CSS only references these
families through a chain of CSS custom properties (`var(--font-sans)` →
`var(--font-archivo)`) with no literal `@font-face` for the scraper to
flag. Practical effect: previews likely render in a fallback sans-serif,
not exact-brand Archivo. Not fixed this run — would need extracting the
actual woff2s from a real `next build` output or Google Fonts CDN and
wiring `cfg.extraFonts`.

## Overlay component overrides

`Dialog`, `AlertDialog`, `Popover` all portal via Radix — each has
`cfg.overrides.<Name>: {"cardMode": "single"}` so the open state renders
inline instead of escaping/collapsing the grid card. `Card` has
`{"cardMode": "column"}` (the `ParkCard` story is wider than a grid cell).

## Re-sync risks

- The pnpm duplicate-React fix above is the single most fragile part of
  this setup — it's pinned to today's exact `.pnpm` store layout
  (`react-dom@19.2.3_react@19.2.3`). A version bump changes that directory
  name; re-derive it with the debug snippet above rather than assuming.
- `ds-styles.css` is a point-in-time Tailwind compile, not wired into any
  watch/build step — a re-sync that adds preview classes without
  re-running the `@source` compile will silently ship unstyled new
  classes (build won't error, it'll just be missing CSS).
- Scope (10 of 39 components) was a deliberate, user-confirmed narrowing,
  not a converter limitation — if the excluded Next.js/Clerk-coupled
  components ever need syncing, they'd need a different approach entirely
  (e.g. mocking `next/navigation` and wrapping Clerk providers), not an
  extension of this config.
- Brand fonts (Archivo/JetBrains Mono) aren't shipped — see above.
