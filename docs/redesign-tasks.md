# Redesign build checklist

One numbered item is one Claude Code session, sized to fit comfortably inside a single usage window. Do them in order: each one assumes the ones above it are done. Tick the boxes as they land and commit this file with `docs: tick session N`.

**How to run a session.** Open Claude Code in the repo and say: *"Do session N from docs/redesign-tasks.md."* Claude reads this file, `CLAUDE.md`, and the design docs, does the chunk, typechecks, commits each piece on its own (one-line prefixed messages, no AI credit), ticks the boxes, and stops. If a session runs long, stop at a ticked box. The next session picks up from the first unticked one.

**Sources of truth** (claude.ai Project "ParkQuest"; copy into `docs/design/` in session 0):
- `parkquest-redesign-sync-spec.md`: what changes, rollout plan (§9), ground rules
- `parkquest-design-details.md`: exact visuals, copy, sizes, states
- `parkquest-interactions-to-keep.md`, `parkquest-gestures-inventory.md`, `parkquest-native-ios-patterns.md`: what must not regress
- `parkquest-codebase-map.md`: where things live
- Claude Design artifact (Mobile v3, iPad, Web Redesign, Web Admin, Launch screen, Emails, Brand): screenshot whichever screen the session is building

**Every session's guardrails:** never run `drizzle-kit generate`/`push`. `.env.local` is the production DB. API changes are additive only, because iOS 1.0.3 depends on them. Typecheck both apps before each commit.

---

## Phase 0: Safety net (on `main`)

- [ ] **0. Setup** (short session)
  - [ ] Commit the CLAUDE.md convention change (`docs: commit rules and redesign checklist`)
  - [ ] Copy the project design docs into `docs/design/` (`docs: add redesign design docs`)
  - [ ] `git tag pre-redesign` (local only; Dan pushes it)
  - [ ] Export the design assets into the repo: icon 1024, splash images (phone + iPad, both orientations), splash emblem (`add: redesign brand assets`). Don't wire them up yet.

## Phase 1: Shared groundwork (on `main`, invisible to users)

- [ ] **1. Design tokens**
  - [ ] One token source (light and dark): colors, type scale, radii, spacing, sentence-case label rule
  - [ ] Web: CSS variables mapped into the Tailwind/shadcn theme, unused
  - [ ] iOS: `theme` module, unused
- [ ] **2. Badges data**
  - [ ] Additive columns on `custom_badges`: level, color family, line icon (hand-written SQL script)
  - [ ] Backfill script mapping current tiers and emoji to the new fields
  - [ ] API returns the new fields alongside the old ones; types in `packages/types`
- [ ] **3. Interests**
  - [ ] Per-user interests table + GET/PUT endpoint
  - [ ] Inference from journal activities (script, then an endpoint that returns suggestions)
- [ ] **4. Collections**
  - [ ] Tables: collections, membership, banner image, description
  - [ ] Public read endpoints; admin CRUD endpoints behind `requireAdmin()`
  - [ ] Seed the first collections from the design
- [ ] **5. Server-side bits for new screens**
  - [ ] Log drafts on the server (skip if already there)
  - [ ] Greeting lines stored as data with conditions + endpoint
  - [ ] Notification preferences (new: there are none today) table + endpoint
  - [ ] Default map view preference, if it's not already stored per user
- [ ] **6. Redaction and profiles API**
  - [ ] Extend `lib/redactAnonPost.ts` to the new public surfaces
  - [ ] Other-person profile endpoint: stamps, badges, mutual friends count (omit the field when 0), privacy-aware
  - [ ] Change-email flow endpoints (start, verify code, confirm) if the current one is a single call
- [ ] **7. Emails**
  - [ ] Rebuild the 5 templates (verification code, password reset, change-email confirm, change-email heads-up, welcome), each light and dark
  - [ ] Send a test of each to Dan's address only

## Phase 2: iPhone and iPad (on `redesign`)

- [ ] **8. Branch and builds**
  - [ ] Create `redesign` from `main`
  - [ ] Second Xcode Cloud workflow → TestFlight internal only, distinct build number. Check `ci_post_clone.sh` env vars (Clerk key). Dan does the Xcode Cloud UI steps; Claude writes the instructions.
- [ ] **9. Brand on device**
  - [ ] App icon 1c in `app.json` (all sizes)
  - [ ] Sunrise launch screen: static splash + animated overlay (sun rise and glow), center-out mask reveal exit kept
- [ ] **10. Shell**
  - [ ] Tab bar with real Liquid Glass, the orange + in the middle
  - [ ] Top fade, native sheets
  - [ ] Appearance moves to Settings only
- [ ] **11. You / Passport, part 1**
  - [ ] Passport card graphics, seal, microprint, foil stats
  - [ ] Remove the tilt only. **Don't touch the gyroscope effect.**
- [ ] **12. You / Passport, part 2**
  - [ ] Stamps grid
  - [ ] Stamp lightbox (date visited, journal entries, open park page)
- [ ] **13. Badges**
  - [ ] Badges as patches (level, color family, line icon)
  - [ ] Badge lightbox
- [ ] **14. Feed**
  - [ ] PostCard fixes
  - [ ] Post menu restyle (Log a visit here / Add friend / Report post / Block user, red destructive items)
- [ ] **15. Other people's profiles**
  - [ ] Person screen from the profile endpoint
  - [ ] Hide the mutual-friends line when there are none
  - [ ] Profile menu (Share passport / Report user / Block user), private-profile state
- [ ] **16. Friends**
  - [ ] Friends screen, pull to refresh
  - [ ] Swipe to unfriend + confirm alert
- [ ] **17. Explore, part 1**
  - [ ] Sixty-Four card and context cards
  - [ ] Greeting rotating from the data endpoint
- [ ] **18. Explore, part 2**
  - [ ] Interests check-in
  - [ ] Picked for you
  - [ ] Collections row + collection page
- [ ] **19. Park page**
  - [ ] Forecast, friends +N, disclaimer
  - [ ] Bottom action bar
- [ ] **20. Map**
  - [ ] Designation menu, Map options, controls, decluttered labels
  - [ ] Offline pill (data from N hours/days ago)
  - [ ] **Don't rebuild the half sheet → full park animation or its parallax.**
- [ ] **21. Location primer**
  - [ ] Primer before the system prompt: Parks "Nearest" sort and the map locate button
  - [ ] Denied state handled
- [ ] **22. Log a visit**
  - [ ] Sheet, both modes
  - [ ] Searchable park picker
  - [ ] Draft prompt
- [ ] **23. Logging moments**
  - [ ] Stamped moment after logging
  - [ ] Badge-earned moment (the new one, replacing the old)
- [ ] **24. Search and notifications**
  - [ ] Search screen
  - [ ] Notifications list
- [ ] **25. Sign-in and create account**
  - [ ] Modeled on the web sign-in: landing hero with meteors, "Start your quest."
  - [ ] Create account, verification code step
- [ ] **26. Onboarding**
  - [ ] Steps 1–4 (simple and fun), park picks, skip
  - [ ] Shows once per new account
- [ ] **27. Settings, part 1**
  - [ ] Settings root restyle
  - [ ] Sign-in & security
  - [ ] Privacy & moderation
- [ ] **28. Settings, part 2**
  - [ ] Notifications (new)
  - [ ] Change email (multi-step)
  - [ ] Offline data
  - [ ] Default map view
- [ ] **29. iPad, part 1**
  - [ ] Sidebar layout at ≥700pt, all orientations in `app.json`
  - [ ] You, Feed, Explore, Park page in the sidebar layout
- [ ] **30. iPad, part 2**
  - [ ] Map, Log a visit, moments (centered), lightboxes, profiles, Friends, Settings sheets
  - [ ] iPad splash
- [ ] **31. Device pass** (Dan on real devices, Claude fixes)
  - [ ] Liquid Glass, sheet physics, light and dark, Dynamic Island clearance
  - [ ] Walk `parkquest-interactions-to-keep.md` and `parkquest-gestures-inventory.md`
  - [ ] TestFlight internal build out

## Phase 3: Web (same `redesign` branch, Vercel preview)

- [ ] **32. Shell**
  - [ ] Sidebar with Passport / Journal / Badges
  - [ ] Account menu opening above the profile row (`DropdownMenu`)
  - [ ] ⌘K search (`CommandDialog`)
  - [ ] Landing meteors (varied, fade without stopping)
- [ ] **33. Explore and collections**
- [ ] **34. Park page and map park panel**
  - [ ] Notifications (`Popover`), Map options (`Popover`)
- [ ] **35. Passport and badges**
  - [ ] Passport, badge lightbox, stamp lightbox
- [ ] **36. Feed and profiles**
  - [ ] Feed, post menu
  - [ ] `/u/{handle}` person page, private state
- [ ] **37. Log a visit**
  - [ ] Fixed-size `Dialog`, `AlertDialog` draft prompt, moments
- [ ] **38. Friends and Settings full pages**
- [ ] **39. Public signed-out pages**
  - [ ] Park, parks list, map, contact, terms, privacy
  - [ ] Redaction checked against the API, not just the UI
- [ ] **40. Sign-in, create account, onboarding** (`Dialog`)
- [ ] **41. Admin, part 1**
  - [ ] Admin shell: gold admin accent, sticky "Admin mode" bar, Exit admin
  - [ ] Dashboard: tiles with comparisons, Needs attention, funnel, heatmap, 12-month calendar, top parks, new people, latest activity
- [ ] **42. Admin, part 2**
  - [ ] Activity (god-view log), Users, Posts, Reports
- [ ] **43. Admin, part 3**
  - [ ] Parks, Badges, Visits, Broadcast, Email, collections editor

## Phase 4: Launch

- [ ] **44. Final pass**
  - [ ] Both platforms against `parkquest-design-details.md` and `parkquest-interactions-to-keep.md`
  - [ ] Reminder: App Store screenshots (from `parkquest-up-next.md`)
- [ ] **45. Ship** (Dan-led)
  - [ ] Submit iOS for App Review from `redesign`
  - [ ] On approval: merge `redesign` → `main` with a merge commit, deploy web the same day, release the app
  - [ ] Keep `pre-redesign` and the previous build for two weeks

---

**Later, not in this plan:** first-run empty states, edit/delete visit, shared post page, passport share image, OG previews (see `parkquest-up-next.md`). Design these before building.
