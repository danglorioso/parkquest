/**
 * Adds Strava hike-tracking support: a generic user_integrations table for
 * OAuth tokens (provider-agnostic, so Garmin/Fitbit can reuse it later) and
 * the stat columns on visits an attached activity fills in. Drizzle's own
 * migration files are stale for this DB (see other scripts in this
 * directory), so schema changes are applied by hand.
 *
 * HISTORICAL: the Strava OAuth connect flow was scrapped (see
 * drop-user-integrations-table.mjs) after Strava paywalled API access —
 * re-running this script recreates a table nothing uses. Kept only as a
 * record of where the (still-live) visits stat columns came from.
 *
 * Usage: node scripts/add-strava-integration.mjs
 * Requires DATABASE_URL (read from .env.local). Remember to run against
 * BOTH the local and the production database.
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
  CREATE TABLE IF NOT EXISTS user_integrations (
    clerk_user_id VARCHAR(255) NOT NULL,
    provider VARCHAR(20) NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    external_athlete_id VARCHAR(64),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (clerk_user_id, provider)
  )
`;

await sql`
  ALTER TABLE visits
    ADD COLUMN IF NOT EXISTS distance_meters REAL,
    ADD COLUMN IF NOT EXISTS duration_seconds INTEGER,
    ADD COLUMN IF NOT EXISTS elevation_gain_meters REAL,
    ADD COLUMN IF NOT EXISTS route_polyline TEXT,
    ADD COLUMN IF NOT EXISTS external_source VARCHAR(20),
    ADD COLUMN IF NOT EXISTS external_activity_id VARCHAR(64)
`;

console.log("user_integrations table + visits Strava columns ready.");
