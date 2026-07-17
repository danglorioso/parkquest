/**
 * Creates app_store_daily_stats — one row per calendar day of App Store
 * Sales Report data (units, proceeds), upserted by the App Store Connect
 * cron route. Drizzle's own migration files are stale for this DB (see
 * other scripts in this directory), so schema changes are applied by hand.
 *
 * Usage: node scripts/create-app-store-stats-table.mjs
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
  CREATE TABLE IF NOT EXISTS app_store_daily_stats (
    report_date DATE PRIMARY KEY,
    units INTEGER NOT NULL,
    proceeds REAL NOT NULL,
    proceeds_currency VARCHAR(3) NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )
`;

console.log("app_store_daily_stats ready.");
