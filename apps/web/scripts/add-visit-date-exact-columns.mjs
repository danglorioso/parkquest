/**
 * Adds visited_date_exact / end_date_exact to visits — false means the user
 * only entered a month/year (day is a placeholder), so display code should
 * format it as "March 2026" instead of "March 1, 2026". Existing rows all
 * have real days, hence the true default.
 *
 * Usage: node scripts/add-visit-date-exact-columns.mjs
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

await sql`ALTER TABLE visits ADD COLUMN IF NOT EXISTS visited_date_exact BOOLEAN NOT NULL DEFAULT true`;
await sql`ALTER TABLE visits ADD COLUMN IF NOT EXISTS end_date_exact BOOLEAN NOT NULL DEFAULT true`;

console.log("visits.visited_date_exact / end_date_exact ready.");
