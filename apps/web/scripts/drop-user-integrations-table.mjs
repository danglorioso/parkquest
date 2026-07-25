/**
 * Rolls back user_integrations from add-strava-integration.mjs — the Strava
 * OAuth connect flow was scrapped after Strava paywalled API access (June
 * 2026, $11.99/mo Standard Tier). Hike tracking moved to GPX file import
 * instead (see lib/gpx.ts on mobile), which needs no token storage. The
 * table was never populated (feature never shipped), so this is a plain
 * drop, no data migration needed. The visits stat columns stay — GPX import
 * still fills them in.
 *
 * Usage: node scripts/drop-user-integrations-table.mjs
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

await sql`DROP TABLE IF EXISTS user_integrations`;

console.log("user_integrations table dropped.");
