/**
 * Deletes user_profiles rows (and all their content) whose clerk_user_id
 * belongs to the DEV Clerk instance. Local dev signs into dev Clerk but
 * writes to the production Neon DB, so dev test accounts accumulate as real
 * rows and inflate the prod admin dashboard's user counts.
 *
 * The target list is derived at runtime: every user id in the Clerk instance
 * of the provided key, intersected with user_profiles. The key MUST be
 * sk_test_ — run with sk_live and this would target real accounts, so it
 * refuses.
 *
 * Dry run (default):  node scripts/purge-dev-instance-users.mjs
 * Actually delete:    node scripts/purge-dev-instance-users.mjs --execute
 *
 * Cleanup order rides the FK cascades: deleting a user's posts/visits
 * cascades their likes/comments/notifications; everything else is deleted
 * explicitly. R2 photo files are NOT touched (test uploads, negligible).
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { neon } from "@neondatabase/serverless";

const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const { DATABASE_URL, CLERK_SECRET_KEY } = process.env;
if (!DATABASE_URL) throw new Error("DATABASE_URL not set");
if (!CLERK_SECRET_KEY?.startsWith("sk_test_")) {
  throw new Error(
    "CLERK_SECRET_KEY must be the DEV (sk_test_...) key — this script deletes " +
      "every DB row belonging to users of the given instance, and pointing it " +
      "at the live instance would purge real accounts."
  );
}

const execute = process.argv.includes("--execute");
const sql = neon(DATABASE_URL);

// Every user id in the dev instance
const devIds = [];
let offset = 0;
for (;;) {
  const res = await fetch(`https://api.clerk.com/v1/users?limit=500&offset=${offset}`, {
    headers: { Authorization: `Bearer ${CLERK_SECRET_KEY}` },
  });
  if (!res.ok) throw new Error(`Clerk API ${res.status}: ${await res.text()}`);
  const page = await res.json();
  for (const u of page) devIds.push(u.id);
  if (page.length < 500) break;
  offset += 500;
}
console.log(`Dev Clerk instance users: ${devIds.length}`);

const targets = (await sql`
  SELECT clerk_user_id, username, display_name FROM user_profiles
  WHERE clerk_user_id = ANY(${devIds})
  ORDER BY username
`);
if (targets.length === 0) {
  console.log("No user_profiles rows belong to the dev instance — nothing to purge.");
  process.exit(0);
}
console.log(`\nProfiles to purge (${targets.length}):`);
for (const t of targets) {
  console.log(`  @${t.username}${t.display_name ? ` (${t.display_name})` : ""}  ${t.clerk_user_id}`);
}
const ids = targets.map((t) => t.clerk_user_id);

// [table label, delete statement] — order matters only in that posts/visits
// go before user_profiles; their FK cascades clean dependent rows.
const steps = [
  ["likes (authored)",        () => sql`DELETE FROM likes WHERE user_id = ANY(${ids})`],
  ["comments (authored)",     () => sql`DELETE FROM comments WHERE user_id = ANY(${ids})`],
  ["notifications",           () => sql`DELETE FROM notifications WHERE recipient_id = ANY(${ids}) OR actor_id = ANY(${ids})`],
  ["friendships",             () => sql`DELETE FROM friendships WHERE requester_id = ANY(${ids}) OR recipient_id = ANY(${ids})`],
  ["blocks",                  () => sql`DELETE FROM blocks WHERE blocker_id = ANY(${ids}) OR blocked_id = ANY(${ids})`],
  ["reports",                 () => sql`DELETE FROM reports WHERE reporter_id = ANY(${ids}) OR (target_type = 'user' AND target_id = ANY(${ids}))`],
  ["user_badges",             () => sql`DELETE FROM user_badges WHERE clerk_user_id = ANY(${ids})`],
  ["push_subscriptions",      () => sql`DELETE FROM push_subscriptions WHERE clerk_user_id = ANY(${ids})`],
  ["expo_push_tokens",        () => sql`DELETE FROM expo_push_tokens WHERE clerk_user_id = ANY(${ids})`],
  ["user_activity_days",      () => sql`DELETE FROM user_activity_days WHERE clerk_user_id = ANY(${ids})`],
  ["posts (cascades likes/comments/notifs on them)", () => sql`DELETE FROM posts WHERE clerk_user_id = ANY(${ids})`],
  ["visits",                  () => sql`DELETE FROM visits WHERE clerk_user_id = ANY(${ids})`],
  ["user_profiles",           () => sql`DELETE FROM user_profiles WHERE clerk_user_id = ANY(${ids})`],
];

if (!execute) {
  console.log("\nDry run — row counts that WOULD be deleted:");
  const counts = [
    ["likes (authored)",   sql`SELECT COUNT(*)::int AS n FROM likes WHERE user_id = ANY(${ids})`],
    ["comments (authored)",sql`SELECT COUNT(*)::int AS n FROM comments WHERE user_id = ANY(${ids})`],
    ["notifications",      sql`SELECT COUNT(*)::int AS n FROM notifications WHERE recipient_id = ANY(${ids}) OR actor_id = ANY(${ids})`],
    ["friendships",        sql`SELECT COUNT(*)::int AS n FROM friendships WHERE requester_id = ANY(${ids}) OR recipient_id = ANY(${ids})`],
    ["blocks",             sql`SELECT COUNT(*)::int AS n FROM blocks WHERE blocker_id = ANY(${ids}) OR blocked_id = ANY(${ids})`],
    ["reports",            sql`SELECT COUNT(*)::int AS n FROM reports WHERE reporter_id = ANY(${ids}) OR (target_type = 'user' AND target_id = ANY(${ids}))`],
    ["user_badges",        sql`SELECT COUNT(*)::int AS n FROM user_badges WHERE clerk_user_id = ANY(${ids})`],
    ["push_subscriptions", sql`SELECT COUNT(*)::int AS n FROM push_subscriptions WHERE clerk_user_id = ANY(${ids})`],
    ["expo_push_tokens",   sql`SELECT COUNT(*)::int AS n FROM expo_push_tokens WHERE clerk_user_id = ANY(${ids})`],
    ["user_activity_days", sql`SELECT COUNT(*)::int AS n FROM user_activity_days WHERE clerk_user_id = ANY(${ids})`],
    ["posts",              sql`SELECT COUNT(*)::int AS n FROM posts WHERE clerk_user_id = ANY(${ids})`],
    ["visits",             sql`SELECT COUNT(*)::int AS n FROM visits WHERE clerk_user_id = ANY(${ids})`],
    ["user_profiles",      sql`SELECT COUNT(*)::int AS n FROM user_profiles WHERE clerk_user_id = ANY(${ids})`],
  ];
  for (const [label, q] of counts) {
    const [{ n }] = await q;
    if (n > 0) console.log(`  ${label}: ${n}`);
  }
  console.log("\nRe-run with --execute to delete.");
  process.exit(0);
}

console.log("\nDeleting…");
for (const [label, run] of steps) {
  await run();
  console.log(`  ✓ ${label}`);
}
console.log(`\nPurged ${ids.length} dev-instance user(s) and all their rows.`);
