/**
 * Creates park_changes — the audit log behind the admin Add park / Edit park
 * panels, NPS sync applies, and the Revert button on /admin/parks. One row per
 * write, with full before/after snapshots of the park's editable fields.
 * Written in the same SQL statement as the parks write it records (see
 * writeParkChange in src/lib/parkAdmin.ts), so a change can't land unlogged.
 *
 * Additive only (CREATE ... IF NOT EXISTS) — touches no existing table.
 * Drizzle's own migration files are stale for this DB (see other scripts in
 * this directory), so schema changes are applied by hand.
 *
 * No flags = dry run, prints the SQL and whether the table exists.
 *   --apply   Creates the table + index.
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

const APPLY = process.argv.includes("--apply");
const sql = neon(DATABASE_URL);

const [{ exists }] = await sql`SELECT to_regclass('public.park_changes') IS NOT NULL AS exists`;
console.log(`park_changes exists: ${exists}`);

const DDL = [
  `CREATE TABLE IF NOT EXISTS park_changes (
    id SERIAL PRIMARY KEY,
    park_code VARCHAR(10) NOT NULL,
    action VARCHAR(20) NOT NULL,
    before JSONB,
    after JSONB NOT NULL,
    changed_fields JSONB NOT NULL,
    admin_clerk_user_id VARCHAR(255) NOT NULL,
    reverts_change_id INTEGER REFERENCES park_changes(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS park_changes_park_code_idx ON park_changes (park_code, created_at DESC)`,
];

for (const stmt of DDL) console.log(`\n${stmt};`);

if (APPLY) {
  for (const stmt of DDL) await sql.query(stmt);
  console.log("\npark_changes ready.");
} else {
  console.log("\nDry run only — re-run with --apply to create.");
}
