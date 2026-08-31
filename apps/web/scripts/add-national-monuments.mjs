/**
 * Adds NPS "National Monument" units to the parks table — second designation
 * expansion after National Historical Parks (see add-historical-parks.mjs).
 * No schema step needed this time — designation/is_national_park already
 * exist and every existing row already has designation backfilled.
 *
 * No flags = dry run, prints what would be inserted, writes nothing.
 * Requires DATABASE_URL and NPS_API_KEY in .env.local
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

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

const APPLY = process.argv.includes("--apply-inserts");

const { neon } = await import("@neondatabase/serverless");
const sql = neon(DATABASE_URL);

console.log("Fetching full NPS unit list...");
const res = await fetch(`https://developer.nps.gov/api/v1/parks?limit=600&api_key=${NPS_API_KEY}`);
if (!res.ok) throw new Error(`NPS API error: ${res.status}`);
const { data: npsParks } = await res.json();
console.log(`Got ${npsParks.length} units from NPS`);

const monuments = npsParks.filter((p) => p.designation === "National Monument");
console.log(`${monuments.length} are National Monument`);

const dbParks = await sql`SELECT park_code FROM parks`;
const existingCodes = new Set(dbParks.map((r) => r.park_code));

const toInsert = monuments.filter((p) => !existingCodes.has(p.parkCode));
const skippedCollisions = monuments.filter((p) => existingCodes.has(p.parkCode));

console.log(`\n${toInsert.length} new rows to add:`);
for (const p of toInsert) {
  console.log(`  ${p.parkCode}\t${p.fullName}\t${p.states}`);
}
if (skippedCollisions.length > 0) {
  console.log(`\n${skippedCollisions.length} skipped — parkCode already exists in DB:`);
  for (const p of skippedCollisions) console.log(`  ${p.parkCode}\t${p.fullName}`);
}

if (APPLY) {
  console.log("\nApplying inserts...");
  let inserted = 0;
  for (const p of toInsert) {
    await sql`
      INSERT INTO parks (park_code, name, states, description, latitude, longitude, image_url, designation, is_national_park)
      VALUES (
        ${p.parkCode}, ${p.fullName}, ${p.states}, ${p.description ?? null},
        ${p.latitude ?? null}, ${p.longitude ?? null}, ${p.images?.[0]?.url ?? null}, ${p.designation ?? ""}, false
      )
      ON CONFLICT (park_code) DO NOTHING
    `;
    inserted++;
  }
  console.log(`Inserted ${inserted} new parks.`);
} else {
  console.log("\nDry run only — re-run with --apply-inserts to write.");
}
