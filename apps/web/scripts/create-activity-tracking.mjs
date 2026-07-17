/**
 * Presence tracking for the admin dashboard's active-user stats.
 *
 * Before this, "active users" only counted write actions (post/visit/like/
 * comment) — a user who opened the app and just browsed was invisible.
 * touchActivity() (src/lib/activity.ts) now records reads too:
 *   - user_profiles.last_seen_at    → "active right now" windows (15m/1h/24h)
 *   - user_activity_days            → one row per user per Eastern-time day,
 *                                      powering historical DAU series
 *
 * Usage: node scripts/create-activity-tracking.mjs
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

const sql = neon(DATABASE_URL);

await sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP`;

await sql`
  CREATE TABLE IF NOT EXISTS user_activity_days (
    clerk_user_id VARCHAR(255) NOT NULL,
    day DATE NOT NULL,
    last_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (clerk_user_id, day)
  )
`;

console.log("last_seen_at + user_activity_days ready.");
