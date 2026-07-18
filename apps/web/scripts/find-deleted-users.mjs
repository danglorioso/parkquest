/**
 * Finds user_profiles rows whose Clerk account no longer exists — i.e. users
 * who deleted their account (or were deleted in the Clerk dashboard). There
 * is no user.deleted webhook wired up, so deletion leaves the profile row
 * (and all their content rows) behind; this diff surfaces them.
 *
 * Read-only. Prints username, display name, clerk_user_id, signup date, and
 * content counts for each profile missing from Clerk.
 *
 * Against prod:  CLERK_SECRET_KEY=sk_live_... DATABASE_URL=postgres://...prod... \
 *                  node scripts/find-deleted-users.mjs
 * (Pass the live key/URL inline like above — don't put sk_live in .env.local.)
 * With no overrides it uses .env.local, i.e. the dev Clerk instance + local DB.
 *
 * --present flips the diff: prints profiles whose id IS in the queried Clerk
 * instance. Clerk ids are instance-scoped, so running this with the sk_test
 * key identifies the DB rows that were created through the DEV instance
 * (e.g. to purge test rows inflating the prod dashboard's user counts).
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
if (!CLERK_SECRET_KEY) throw new Error("CLERK_SECRET_KEY not set");

const keyKind = CLERK_SECRET_KEY.startsWith("sk_live_") ? "LIVE (production)" : "TEST (dev)";
console.log(`Clerk instance: ${keyKind}`);
console.log(`Database:       ${new URL(DATABASE_URL).hostname}\n`);

const sql = neon(DATABASE_URL);

const profiles = await sql`
  SELECT
    up.clerk_user_id, up.username, up.display_name, up.created_at,
    (SELECT COUNT(*)::int FROM visits v WHERE v.clerk_user_id = up.clerk_user_id) AS visits,
    (SELECT COUNT(*)::int FROM posts p WHERE p.clerk_user_id = up.clerk_user_id) AS posts
  FROM user_profiles up
  ORDER BY up.created_at
`;
console.log(`user_profiles rows: ${profiles.length}`);

// Page through every Clerk user id. /v1/users caps limit at 500 per page.
const clerkIds = new Set();
let offset = 0;
for (;;) {
  const res = await fetch(`https://api.clerk.com/v1/users?limit=500&offset=${offset}`, {
    headers: { Authorization: `Bearer ${CLERK_SECRET_KEY}` },
  });
  if (!res.ok) throw new Error(`Clerk API ${res.status}: ${await res.text()}`);
  const page = await res.json();
  for (const u of page) clerkIds.add(u.id);
  if (page.length < 500) break;
  offset += 500;
}
console.log(`Clerk users:        ${clerkIds.size}\n`);

const present = process.argv.includes("--present");
const matches = profiles.filter((p) => clerkIds.has(p.clerk_user_id) === present);

if (matches.length === 0) {
  console.log(present
    ? "No profile rows belong to this Clerk instance."
    : "No orphaned profiles — every user_profiles row still has a Clerk account.");
} else {
  console.log(present
    ? `${matches.length} profile(s) whose Clerk account exists in THIS instance (${keyKind}):\n`
    : `${matches.length} profile(s) with no Clerk account in this instance:\n`);
  for (const p of matches) {
    const joined = new Date(p.created_at).toISOString().slice(0, 10);
    console.log(
      `  @${p.username}` +
      (p.display_name ? ` (${p.display_name})` : "") +
      `  ${p.clerk_user_id}  joined ${joined}  ·  ${p.visits} visits, ${p.posts} posts`
    );
  }
}
