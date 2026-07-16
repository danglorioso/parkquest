/**
 * Finds clerk_user_ids referenced in app tables (posts, visits, likes,
 * comments, friendships, user_badges, notifications, push subscriptions)
 * that have no matching row in user_profiles, and creates one from Clerk
 * data — mirroring the auto-create logic in src/lib/ensureUserProfile.ts.
 *
 * These orphans happen when GET /api/profile (called once, client-side,
 * right after signup) fails silently and the user is left fully
 * authenticated with no profile row. See src/lib/ensureUserProfile.ts.
 *
 * Dry run (default):  CLERK_SECRET_KEY=sk_live_... node scripts/backfill-orphan-profiles.mjs
 * Actually insert:     CLERK_SECRET_KEY=sk_live_... node scripts/backfill-orphan-profiles.mjs --execute
 *
 * Requires DATABASE_URL (read from .env.local). CLERK_SECRET_KEY must be the
 * sk_live key — with sk_test the users won't be found in the production
 * Clerk instance and will be skipped as "not found in Clerk".
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
if (!CLERK_SECRET_KEY?.startsWith("sk_live_")) {
  throw new Error(
    "CLERK_SECRET_KEY must be the production (sk_live_...) key. " +
      "Refusing to run with a dev key."
  );
}

const execute = process.argv.includes("--execute");
const sql = neon(DATABASE_URL);

// --- 1. Collect every clerk_user_id referenced anywhere, minus known profiles

const existingTables = new Set(
  (
    await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
  ).map((r) => r.table_name)
);
const skipTable = (t) => {
  if (existingTables.has(t)) return false;
  console.log(`  (skipping ${t} — table does not exist in this database)`);
  return true;
};

const idSources = [
  ["posts", "clerk_user_id"],
  ["visits", "clerk_user_id"],
  ["likes", "user_id"],
  ["comments", "user_id"],
  ["friendships", "requester_id"],
  ["friendships", "recipient_id"],
  ["user_badges", "clerk_user_id"],
  ["notifications", "recipient_id"],
  ["push_subscriptions", "clerk_user_id"],
  ["expo_push_tokens", "clerk_user_id"],
];

// table/column names come from the fixed idSources list above, never from
// user input, so sql.unsafe() here is just identifier interpolation, not a
// SQL-injection risk.
const orphanIds = new Set();
for (const [table, column] of idSources) {
  if (skipTable(table)) continue;
  const rows = await sql`
    SELECT DISTINCT t.${sql.unsafe(column)} AS id
    FROM ${sql.unsafe(table)} t
    WHERE t.${sql.unsafe(column)} IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM user_profiles up WHERE up.clerk_user_id = t.${sql.unsafe(column)})
  `;
  for (const r of rows) orphanIds.add(r.id);
}

console.log(`Found ${orphanIds.size} clerk_user_id(s) with activity but no user_profiles row.`);
if (orphanIds.size === 0) process.exit(0);

// --- 2. Fetch each from Clerk, derive a username the same way the app does

async function fetchClerkUser(id) {
  const res = await fetch(`https://api.clerk.com/v1/users/${id}`, {
    headers: { Authorization: `Bearer ${CLERK_SECRET_KEY}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Clerk API ${res.status} for ${id}: ${await res.text()}`);
  return res.json();
}

function deriveUsername(clerkUser, userId, takenUsernames) {
  const rawUsername =
    clerkUser.username ??
    clerkUser.email_addresses?.[0]?.email_address?.split("@")[0] ??
    `user_${userId.slice(-8)}`;
  const base = rawUsername.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 50);
  let candidate = takenUsernames.has(base) ? `${base}_${userId.slice(-4)}` : base;
  // Extremely unlikely, but guard against a second collision in this same run
  let suffix = 0;
  while (takenUsernames.has(candidate)) {
    suffix += 1;
    candidate = `${base}_${userId.slice(-4)}${suffix}`;
  }
  return candidate;
}

const existingUsernames = new Set(
  (await sql`SELECT username FROM user_profiles`).map((r) => r.username)
);

const toCreate = [];
const notFoundInClerk = [];
for (const id of orphanIds) {
  const clerkUser = await fetchClerkUser(id);
  if (!clerkUser) {
    notFoundInClerk.push(id);
    continue;
  }
  const username = deriveUsername(clerkUser, id, existingUsernames);
  existingUsernames.add(username);
  const displayName =
    [clerkUser.first_name, clerkUser.last_name].filter(Boolean).join(" ") || null;
  toCreate.push({
    clerk_user_id: id,
    username,
    display_name: displayName,
    avatar_url: clerkUser.image_url ?? null,
  });
}

console.log(`\nProfiles to create: ${toCreate.length}`);
for (const p of toCreate) console.log(`  ${p.username}  (${p.clerk_user_id})`);
if (notFoundInClerk.length > 0) {
  console.log(`\nSkipped — no longer exist in Clerk (deleted accounts, orphan rows stay as-is): ${notFoundInClerk.length}`);
  for (const id of notFoundInClerk) console.log(`  ${id}`);
}

// --- 3. Insert -----------------------------------------------------------

if (!execute) {
  console.log("\nDry run — nothing inserted. Re-run with --execute to create the rows above.");
  process.exit(0);
}
if (toCreate.length === 0) {
  console.log("\nNothing to insert.");
  process.exit(0);
}

console.log("\nInserting...");
for (const p of toCreate) {
  await sql`
    INSERT INTO user_profiles (clerk_user_id, username, display_name, avatar_url)
    VALUES (${p.clerk_user_id}, ${p.username}, ${p.display_name}, ${p.avatar_url})
    ON CONFLICT (clerk_user_id) DO NOTHING
  `;
}
console.log(`Done. Inserted ${toCreate.length} profile(s).`);
