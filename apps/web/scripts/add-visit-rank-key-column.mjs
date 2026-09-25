/**
 * Adds rank_key to visits — a fractional/lexicographic key (base62) that orders
 * a user's visited parks for the pairwise-ranking feature. Null = not yet ranked.
 * See apps/web/src/lib/rankKey.ts for the midpoint algorithm that fills it in.
 *
 * Usage: node scripts/add-visit-rank-key-column.mjs
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

await sql`ALTER TABLE visits ADD COLUMN IF NOT EXISTS rank_key VARCHAR(32)`;

console.log("visits.rank_key ready.");
