/**
 * Deletes orphaned "someone sent you a friend request" notifications whose
 * underlying friendship was already accepted, rejected, or deleted before
 * the accept/reject/cancel routes started cleaning these up themselves.
 *
 * Dry run (default):  node scripts/cleanup-stale-friend-notifications.mjs
 * Actually delete:    node scripts/cleanup-stale-friend-notifications.mjs --execute
 *
 * Requires DATABASE_URL (read from .env.local).
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

const stale = await sql`
  SELECT n.id, n.recipient_id, n.created_at, f.id AS friendship_id, f.status AS friendship_status
  FROM notifications n
  LEFT JOIN friendships f ON f.id = (n.metadata->>'friendship_id')::int
  WHERE n.type = 'friend_request'
    AND (f.id IS NULL OR f.status != 'pending')
  ORDER BY n.created_at`;

console.log(`Stale friend_request notifications: ${stale.length}`);
for (const n of stale) {
  console.log(`  id=${n.id} recipient=${n.recipient_id} friendship=${n.friendship_id ?? 'deleted'} status=${n.friendship_status ?? 'n/a'} created=${n.created_at}`);
}

if (!execute) {
  console.log("\nDry run — nothing deleted. Re-run with --execute to delete the rows above.");
  process.exit(0);
}

if (stale.length > 0) {
  const ids = stale.map((n) => n.id);
  const deleted = await sql`DELETE FROM notifications WHERE id = ANY(${ids}) RETURNING id`;
  console.log(`\nDeleted ${deleted.length} notifications.`);
} else {
  console.log("\nNothing to delete.");
}
