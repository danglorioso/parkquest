/**
 * Populates / refreshes the parks.image_url column from NPS API.
 * - Updates parks where NPS has a new or different first image
 * - Clears image_url to NULL for parks where NPS no longer has any images
 * Run with: node scripts/sync-park-images.mjs
 * Requires DATABASE_URL and NPS_API_KEY in .env.local
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local when present; Vercel builds rely on injected env vars.
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
    process.env[key] = value;
  }
}

const { DATABASE_URL, NPS_API_KEY } = process.env;
if (!DATABASE_URL) throw new Error("DATABASE_URL not set");
if (!NPS_API_KEY) throw new Error("NPS_API_KEY not set");

const { neon } = await import("@neondatabase/serverless");
const sql = neon(DATABASE_URL);

console.log("Adding image_url column if missing...");
await sql`ALTER TABLE parks ADD COLUMN IF NOT EXISTS image_url text`;

console.log("Fetching park images from NPS API...");
const res = await fetch(
  `https://developer.nps.gov/api/v1/parks?limit=500&api_key=${NPS_API_KEY}`
);
if (!res.ok) throw new Error(`NPS API error: ${res.status}`);

const { data: npsParks } = await res.json();
console.log(`Got ${npsParks.length} parks from NPS`);

// Parks stored separately in our DB that share a single NPS code.
// Must stay in sync with src/lib/npsCodeMap.ts.
const NPS_CODE_OVERRIDES = { sequ: "seki", king: "seki" };

// Build a map of parkCode → first image URL (null = NPS has no images for this code)
const npsImageMap = new Map();
for (const park of npsParks) {
  npsImageMap.set(park.parkCode, park.images?.[0]?.url ?? null);
}

// Fetch all park codes we have in the DB
const dbParks = await sql`SELECT park_code, image_url FROM parks`;

let updated = 0;
let cleared = 0;

for (const row of dbParks) {
  const code = row.park_code;
  const currentUrl = row.image_url;
  // Translate our local code to the NPS code before looking up the image
  const npsCode = NPS_CODE_OVERRIDES[code] ?? code;
  const npsUrl = npsImageMap.get(npsCode) ?? null;

  if (npsUrl === currentUrl) continue; // nothing changed

  if (npsUrl) {
    await sql`UPDATE parks SET image_url = ${npsUrl} WHERE park_code = ${code}`;
    updated++;
  } else {
    // NPS no longer has images for this park — clear the stale URL
    await sql`UPDATE parks SET image_url = NULL WHERE park_code = ${code}`;
    cleared++;
  }
}

console.log(`Updated ${updated} parks, cleared ${cleared} stale URLs`);
