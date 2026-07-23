/**
 * Adds parks.stamp_glyph — an admin-uploaded override for a park's passport
 * stamp center icon (see /admin/parks). jsonb shape: { viewBox, paths }
 * (see CustomStampGlyph in packages/types/src/parkGlyphs.ts). Drizzle's own
 * migration files are stale for this DB (see other scripts in this
 * directory), so schema changes are applied by hand.
 *
 * Usage: node scripts/add-park-stamp-glyph-column.mjs
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

await sql`ALTER TABLE parks ADD COLUMN IF NOT EXISTS stamp_glyph JSONB`;

console.log("parks.stamp_glyph ready.");
