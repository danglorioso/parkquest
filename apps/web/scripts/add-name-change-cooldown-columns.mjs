/**
 * Adds username_changed_at / display_name_changed_at to user_profiles —
 * backs the once-per-week rename cooldown enforced in /api/profile.
 * Drizzle's migration journal is stale for this DB, so schema changes are
 * applied by hand (see other scripts in this directory).
 *
 * Usage: node scripts/add-name-change-cooldown-columns.mjs
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

await sql`
  ALTER TABLE user_profiles
    ADD COLUMN IF NOT EXISTS username_changed_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS display_name_changed_at TIMESTAMP
`;

console.log("user_profiles.username_changed_at / display_name_changed_at ready.");
