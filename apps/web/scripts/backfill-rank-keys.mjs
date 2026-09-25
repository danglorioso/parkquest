/**
 * Seeds visits.rank_key for every user's existing rated visits, ordered by
 * their old star rating (DESC, ties broken by visited_date ASC) — one-time
 * migration for the pairwise-ranking feature replacing star ratings. See
 * apps/web/src/lib/rankKey.ts for the algorithm new placements use going
 * forward; this script assigns evenly-spaced initial keys using the same
 * base62 alphabet so future inserts inter-leave correctly.
 *
 * Unrated visits are left with rank_key = NULL — untouched, nudged to rank
 * later in the app rather than forced into an arbitrary position here.
 *
 * Dry run (default):  node scripts/backfill-rank-keys.mjs
 * Actually write:      node scripts/backfill-rank-keys.mjs --execute
 *
 * Requires DATABASE_URL (read from .env.local) — this IS the production
 * Neon DB for this repo, per CLAUDE.md.
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

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) throw new Error("DATABASE_URL not set");

const execute = process.argv.includes("--execute");
const sql = neon(DATABASE_URL);

// Same alphabet/ordering as apps/web/src/lib/rankKey.ts — duplicated here
// since this is a standalone script, not bundled against src/.
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const BASE = ALPHABET.length; // 62
const KEY_LEN = 3; // 62^3 = 238,328 slots — plenty even for a user ranking every NPS unit

function indexToKey(i, count) {
  // Spread across the middle of the key space (never the very first/last
  // slot) so both rankKey.ts's beforeKey/afterKey have room to place a new
  // favorite/least-favorite without immediately exhausting precision.
  const span = BASE ** KEY_LEN - 2;
  const slot = count <= 1 ? Math.floor(span / 2) : Math.round((i * span) / (count - 1));
  const n = slot + 1;
  let rest = n;
  const chars = [];
  for (let d = 0; d < KEY_LEN; d++) {
    chars.unshift(ALPHABET[rest % BASE]);
    rest = Math.floor(rest / BASE);
  }
  return chars.join("");
}

const users = (
  await sql`SELECT DISTINCT clerk_user_id FROM visits WHERE rating IS NOT NULL AND rank_key IS NULL`
).map((r) => r.clerk_user_id);

console.log(`Found ${users.length} user(s) with rated, unranked visits.`);

let totalPlanned = 0;
const plan = [];
for (const userId of users) {
  const rows = await sql`
    SELECT id, park_code, rating, visited_date
    FROM visits
    WHERE clerk_user_id = ${userId} AND rating IS NOT NULL AND rank_key IS NULL
    ORDER BY rating DESC, visited_date ASC
  `;
  rows.forEach((row, i) => {
    const key = indexToKey(i, rows.length);
    plan.push({ id: row.id, park_code: row.park_code, rating: row.rating, key });
  });
  totalPlanned += rows.length;
  console.log(`  ${userId}: ${rows.length} visit(s)`);
}

console.log(`\nTotal visits to seed rank_key for: ${totalPlanned}`);

if (!execute) {
  console.log("\nDry run — nothing written. Re-run with --execute to apply.");
  console.log("Sample (first 10):");
  for (const p of plan.slice(0, 10)) {
    console.log(`  visit ${p.id} (${p.park_code}, rating ${p.rating}) -> rank_key ${p.key}`);
  }
  process.exit(0);
}

console.log("\nWriting...");
for (const p of plan) {
  await sql`UPDATE visits SET rank_key = ${p.key} WHERE id = ${p.id}`;
}
console.log(`Done. Seeded rank_key for ${plan.length} visit(s).`);
