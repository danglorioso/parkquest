/**
 * Deletes app-database rows belonging to dev-instance Clerk users.
 *
 * Fetches every user ID from the PRODUCTION Clerk instance, then removes all
 * rows whose clerk_user_id is not in that list — profiles, visits, posts
 * (likes/comments/notifications on them cascade), likes, comments,
 * friendships, badges, notifications, and push tokens left over from
 * development. Parks and all data owned by production users are untouched.
 *
 * Dry run (default):  CLERK_SECRET_KEY=sk_live_... node scripts/cleanup-dev-users.mjs
 * Actually delete:    CLERK_SECRET_KEY=sk_live_... node scripts/cleanup-dev-users.mjs --execute
 *
 * Optional migration: --migrate-from <old_dev_user_id> --migrate-to <new_prod_user_id>
 * reassigns the old account's visits, posts, comments, badges, and likes to the
 * new production account before the cleanup deletes run (badges/likes the new
 * account already has are dropped as duplicates). The old profile row itself is
 * still deleted, freeing its username.
 *
 * If the target database differs from .env.local, pass it inline:
 *   DATABASE_URL='postgres://...' CLERK_SECRET_KEY=sk_live_... node scripts/cleanup-dev-users.mjs
 *
 * Requires DATABASE_URL (read from .env.local). CLERK_SECRET_KEY must be the
 * sk_live key: with sk_test the "live user" list would be the dev users and
 * the script would delete your production accounts instead.
 *
 * Photo storage keys from deleted posts/visits are written to
 * scripts/deleted-photo-keys.json so the files can be removed from storage
 * separately; this script only touches the database.
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { neon } from "@neondatabase/serverless";

// Load .env.local when present, but never overwrite variables passed inline —
// CLERK_SECRET_KEY must be able to come from the command line while the file
// still holds the sk_test key for local development.
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
      "Refusing to run with a dev key — it would classify production users as orphans."
  );
}

const execute = process.argv.includes("--execute");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}
const migrateFrom = argValue("--migrate-from");
const migrateTo = argValue("--migrate-to");
if (!!migrateFrom !== !!migrateTo) {
  throw new Error("--migrate-from and --migrate-to must be used together");
}

const sql = neon(DATABASE_URL);

// --- 1. Fetch every user ID in the production Clerk instance ---------------

async function fetchLiveUserIds() {
  const ids = [];
  const limit = 500;
  for (let offset = 0; ; offset += limit) {
    const res = await fetch(
      `https://api.clerk.com/v1/users?limit=${limit}&offset=${offset}`,
      { headers: { Authorization: `Bearer ${CLERK_SECRET_KEY}` } }
    );
    if (!res.ok) {
      throw new Error(`Clerk API ${res.status}: ${await res.text()}`);
    }
    const page = await res.json();
    ids.push(...page.map((u) => u.id));
    if (page.length < limit) break;
  }
  return ids;
}

const liveIds = await fetchLiveUserIds();
if (liveIds.length === 0) {
  throw new Error(
    "Production Clerk instance returned zero users — aborting rather than deleting every row."
  );
}
console.log(`Production Clerk users: ${liveIds.length}`);

if (migrateFrom) {
  if (!liveIds.includes(migrateTo)) {
    throw new Error(`--migrate-to ${migrateTo} is not a production Clerk user`);
  }
  if (liveIds.includes(migrateFrom)) {
    throw new Error(`--migrate-from ${migrateFrom} is a production user — nothing to migrate`);
  }
}
// Rows owned by the migrate-from user are reassigned, not deleted, so treat
// that ID as kept when reporting deletions and exporting photo references.
const keepIds = migrateFrom ? [...liveIds, migrateFrom] : liveIds;

// Some schema.ts tables may not have been migrated to this database yet
// (e.g. expo_push_tokens) — skip those instead of failing.
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

// --- 2. Report what would be deleted ----------------------------------------

const orphanProfiles = await sql`
  SELECT clerk_user_id, username FROM user_profiles
  WHERE NOT (clerk_user_id = ANY(${liveIds}))
  ORDER BY username`;

if (migrateFrom) {
  const [mv] = await sql`SELECT count(*)::int AS n FROM visits WHERE clerk_user_id = ${migrateFrom}`;
  const [mp] = await sql`SELECT count(*)::int AS n FROM posts WHERE clerk_user_id = ${migrateFrom}`;
  const [mc] = await sql`SELECT count(*)::int AS n FROM comments WHERE user_id = ${migrateFrom}`;
  const [mb] = await sql`SELECT count(*)::int AS n FROM user_badges
    WHERE clerk_user_id = ${migrateFrom}
      AND badge_id NOT IN (SELECT badge_id FROM user_badges WHERE clerk_user_id = ${migrateTo})`;
  const [ml] = await sql`SELECT count(*)::int AS n FROM likes
    WHERE user_id = ${migrateFrom}
      AND NOT EXISTS (SELECT 1 FROM likes l2 WHERE l2.user_id = ${migrateTo} AND l2.post_id = likes.post_id)`;
  console.log(`\nMigrating ${migrateFrom} -> ${migrateTo}:`);
  console.log(`  visits: ${mv.n}, posts: ${mp.n}, comments: ${mc.n}, badges: ${mb.n}, likes: ${ml.n}`);
  console.log("  (badges/likes the new account already has are dropped as duplicates)");
}

const counts = {};
const countQueries = {
  visits: () => sql`SELECT count(*)::int AS n FROM visits WHERE NOT (clerk_user_id = ANY(${keepIds}))`,
  posts: () => sql`SELECT count(*)::int AS n FROM posts WHERE NOT (clerk_user_id = ANY(${keepIds}))`,
  likes: () => sql`SELECT count(*)::int AS n FROM likes WHERE NOT (user_id = ANY(${liveIds}))`,
  comments: () => sql`SELECT count(*)::int AS n FROM comments WHERE NOT (user_id = ANY(${keepIds}))`,
  friendships: () => sql`SELECT count(*)::int AS n FROM friendships
    WHERE NOT (requester_id = ANY(${liveIds})) OR NOT (recipient_id = ANY(${liveIds}))`,
  user_badges: () => sql`SELECT count(*)::int AS n FROM user_badges WHERE NOT (clerk_user_id = ANY(${liveIds}))`,
  notifications: () => sql`SELECT count(*)::int AS n FROM notifications
    WHERE NOT (recipient_id = ANY(${liveIds}))
       OR (actor_id IS NOT NULL AND NOT (actor_id = ANY(${liveIds})))`,
  push_subscriptions: () => sql`SELECT count(*)::int AS n FROM push_subscriptions WHERE NOT (clerk_user_id = ANY(${liveIds}))`,
  expo_push_tokens: () => sql`SELECT count(*)::int AS n FROM expo_push_tokens WHERE NOT (clerk_user_id = ANY(${liveIds}))`,
};
for (const [table, q] of Object.entries(countQueries)) {
  if (skipTable(table)) continue;
  counts[table] = (await q())[0].n;
}

console.log(`\nOrphaned profiles to delete: ${orphanProfiles.length}`);
for (const p of orphanProfiles) console.log(`  ${p.username}  (${p.clerk_user_id})`);
console.log("\nDependent rows to delete:");
for (const [table, n] of Object.entries(counts)) console.log(`  ${table}: ${n}`);

// --- 3. Export photo keys before the rows disappear --------------------------

const postPhotos = await sql`
  SELECT photos FROM posts
  WHERE NOT (clerk_user_id = ANY(${keepIds})) AND photos IS NOT NULL`;
const visitPhotos = await sql`
  SELECT photos, cover_photo FROM visits
  WHERE NOT (clerk_user_id = ANY(${keepIds}))
    AND (photos IS NOT NULL OR cover_photo IS NOT NULL)`;

const photoRefs = {
  postPhotoKeys: postPhotos.flatMap((r) => (r.photos ?? []).map((p) => p.key ?? p.url)),
  visitPhotoUrls: visitPhotos.flatMap((r) => [
    ...(r.photos ?? []),
    ...(r.cover_photo ? [r.cover_photo] : []),
  ]),
};
const photoCount = photoRefs.postPhotoKeys.length + photoRefs.visitPhotoUrls.length;
if (photoCount > 0) {
  const outPath = resolve(process.cwd(), "scripts/deleted-photo-keys.json");
  writeFileSync(outPath, JSON.stringify(photoRefs, null, 2));
  console.log(`\nPhoto references saved to ${outPath} (${photoCount} items) for storage cleanup.`);
}

// --- 4. Delete ---------------------------------------------------------------

if (!execute) {
  console.log("\nDry run — nothing deleted. Re-run with --execute to delete the rows above.");
  process.exit(0);
}

console.log("\nDeleting...");
// Single transaction. Migration updates run first so reassigned rows carry a
// production user ID before any delete sees them; duplicate badges/likes left
// under the old ID fall through to the deletes. Posts go first among deletes
// so their likes/comments/notifications cascade; the remaining statements
// catch orphan-authored rows on surviving posts and everything keyed directly
// to the orphan user IDs.
const migrationStatements = migrateFrom
  ? [
      (tx) => tx`UPDATE visits SET clerk_user_id = ${migrateTo} WHERE clerk_user_id = ${migrateFrom} RETURNING 1`,
      (tx) => tx`UPDATE posts SET clerk_user_id = ${migrateTo} WHERE clerk_user_id = ${migrateFrom} RETURNING 1`,
      (tx) => tx`UPDATE comments SET user_id = ${migrateTo} WHERE user_id = ${migrateFrom} RETURNING 1`,
      (tx) => tx`UPDATE user_badges SET clerk_user_id = ${migrateTo}
         WHERE clerk_user_id = ${migrateFrom}
           AND badge_id NOT IN (SELECT badge_id FROM user_badges WHERE clerk_user_id = ${migrateTo})
         RETURNING 1`,
      (tx) => tx`UPDATE likes SET user_id = ${migrateTo}
         WHERE user_id = ${migrateFrom}
           AND NOT EXISTS (SELECT 1 FROM likes l2 WHERE l2.user_id = ${migrateTo} AND l2.post_id = likes.post_id)
         RETURNING 1`,
    ]
  : [];
const deleteStatements = {
  posts: (tx) => tx`DELETE FROM posts WHERE NOT (clerk_user_id = ANY(${liveIds})) RETURNING 1`,
  visits: (tx) => tx`DELETE FROM visits WHERE NOT (clerk_user_id = ANY(${liveIds})) RETURNING 1`,
  likes: (tx) => tx`DELETE FROM likes WHERE NOT (user_id = ANY(${liveIds})) RETURNING 1`,
  comments: (tx) => tx`DELETE FROM comments WHERE NOT (user_id = ANY(${liveIds})) RETURNING 1`,
  friendships: (tx) => tx`DELETE FROM friendships
     WHERE NOT (requester_id = ANY(${liveIds})) OR NOT (recipient_id = ANY(${liveIds}))
     RETURNING 1`,
  user_badges: (tx) => tx`DELETE FROM user_badges WHERE NOT (clerk_user_id = ANY(${liveIds})) RETURNING 1`,
  notifications: (tx) => tx`DELETE FROM notifications
     WHERE NOT (recipient_id = ANY(${liveIds}))
        OR (actor_id IS NOT NULL AND NOT (actor_id = ANY(${liveIds})))
     RETURNING 1`,
  push_subscriptions: (tx) => tx`DELETE FROM push_subscriptions WHERE NOT (clerk_user_id = ANY(${liveIds})) RETURNING 1`,
  expo_push_tokens: (tx) => tx`DELETE FROM expo_push_tokens WHERE NOT (clerk_user_id = ANY(${liveIds})) RETURNING 1`,
  user_profiles: (tx) => tx`DELETE FROM user_profiles WHERE NOT (clerk_user_id = ANY(${liveIds})) RETURNING 1`,
};
const tables = Object.keys(deleteStatements).filter((t) => existingTables.has(t));
const results = await sql.transaction((tx) => [
  ...migrationStatements.map((f) => f(tx)),
  ...tables.map((t) => deleteStatements[t](tx)),
]);

const migrated = results.slice(0, migrationStatements.length);
const deleted = results.slice(migrationStatements.length);
if (migrateFrom) {
  const migTables = ["visits", "posts", "comments", "user_badges", "likes"];
  console.log("Rows migrated per table:");
  migTables.forEach((t, i) => console.log(`  ${t}: ${migrated[i].length}`));
}
console.log("Done. Rows deleted per table:");
tables.forEach((t, i) => console.log(`  ${t}: ${deleted[i].length}`));
