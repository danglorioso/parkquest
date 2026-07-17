/**
 * Adds App Store Connect *analytics* columns to app_store_daily_stats —
 * impressions, product page views, and download-type splits from the
 * Analytics Reports API (a separate pipeline from the sales reports that
 * populate units/proceeds). Nullable on purpose: NULL means "no analytics
 * fetched for this day yet", distinct from a real zero. Drizzle's own
 * migration files are stale for this DB (see other scripts in this
 * directory), so schema changes are applied by hand.
 *
 * Usage: node scripts/add-app-store-analytics-columns.mjs
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
  ALTER TABLE app_store_daily_stats
    ADD COLUMN IF NOT EXISTS impressions INTEGER,
    ADD COLUMN IF NOT EXISTS impressions_unique INTEGER,
    ADD COLUMN IF NOT EXISTS product_page_views INTEGER,
    ADD COLUMN IF NOT EXISTS first_time_downloads INTEGER,
    ADD COLUMN IF NOT EXISTS redownloads INTEGER
`;

await sql`
  CREATE TABLE IF NOT EXISTS app_store_device_downloads (
    report_date DATE NOT NULL,
    device VARCHAR(64) NOT NULL,
    first_time_downloads INTEGER NOT NULL DEFAULT 0,
    redownloads INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (report_date, device)
  )
`;

console.log("app_store_daily_stats analytics columns + app_store_device_downloads ready.");
