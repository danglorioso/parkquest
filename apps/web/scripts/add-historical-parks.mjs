/**
 * Adds NPS "National Historical Park" units to the parks table (v2.0 expansion
 * beyond the original 63 National Parks). Also backfills a `designation`
 * column on every existing row, so the table is self-describing going
 * forward instead of implicitly "always National Park".
 *
 * Two separate apply steps, deliberately NOT bundled into one, because they
 * have opposite deploy-ordering requirements against the SAME live prod DB
 * (there's no schema branching here — .env.local's DATABASE_URL is prod):
 *
 *   --apply-schema   Adds the two columns + backfills is_national_park/
 *                    designation on the existing 63 rows. Safe to run RIGHT
 *                    NOW, before merging/deploying this branch — old deployed
 *                    code doesn't select these columns, so adding them and
 *                    backfilling existing rows changes nothing it reads.
 *                    Must run BEFORE deploying the scope-aware badges.ts code
 *                    (apps/web/src/lib/badges.ts +
 *                    apps/web/src/app/api/badges/route.ts +
 *                    apps/web/src/lib/badgeRevocation.ts), which explicitly
 *                    SELECTs these columns — deploying that code first would
 *                    break every /api/badges call with a missing-column error.
 *
 *   --apply-inserts  Adds the 64 new National Historical Park rows. Must run
 *                    AFTER the scope-aware code above is live in prod — the
 *                    OLD (unscoped) badges.ts counts every row toward
 *                    "visit every park", so inserting first would silently
 *                    jump that badge's target 63→127 for real users before
 *                    the fix protecting against that is deployed.
 *
 * No flags = dry run, prints what either step would do, writes nothing.
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

const APPLY_SCHEMA = process.argv.includes("--apply-schema");
const APPLY_INSERTS = process.argv.includes("--apply-inserts");
if (APPLY_SCHEMA && APPLY_INSERTS) {
  throw new Error("Run --apply-schema first, confirm it's deployed, then run --apply-inserts separately — not together.");
}

const { neon } = await import("@neondatabase/serverless");
const sql = neon(DATABASE_URL);

// Parks stored separately in our DB that share a single NPS code — must
// stay in sync with src/lib/npsCodeMap.ts.
const NPS_CODE_OVERRIDES = { sequ: "seki", king: "seki" };

console.log("Fetching full NPS unit list...");
const res = await fetch(`https://developer.nps.gov/api/v1/parks?limit=500&api_key=${NPS_API_KEY}`);
if (!res.ok) throw new Error(`NPS API error: ${res.status}`);
const { data: npsParks } = await res.json();
console.log(`Got ${npsParks.length} units from NPS`);

const historical = npsParks.filter((p) => p.designation === "National Historical Park");
console.log(`${historical.length} are National Historical Park`);

const dbParks = await sql`SELECT park_code FROM parks`;
const existingCodes = new Set(dbParks.map((r) => r.park_code));

const toInsert = historical.filter((p) => !existingCodes.has(p.parkCode));
const skippedCollisions = historical.filter((p) => existingCodes.has(p.parkCode));

console.log(`\n${toInsert.length} new rows to add (via --apply-inserts, only after deploy):`);
for (const p of toInsert) {
  console.log(`  ${p.parkCode}\t${p.fullName}\t${p.states}`);
}
if (skippedCollisions.length > 0) {
  console.log(`\n${skippedCollisions.length} skipped — parkCode already exists in DB:`);
  for (const p of skippedCollisions) console.log(`  ${p.parkCode}\t${p.fullName}`);
}

// Backfill designation on every existing row using its own NPS record.
const npsByCode = new Map(npsParks.map((p) => [p.parkCode, p]));
const backfill = dbParks
  .map((r) => {
    const npsCode = NPS_CODE_OVERRIDES[r.park_code] ?? r.park_code;
    const nps = npsByCode.get(npsCode);
    return nps ? { park_code: r.park_code, designation: nps.designation ?? "" } : null;
  })
  .filter((x) => x != null);

console.log(`\n${backfill.length} existing rows will get a backfilled designation (via --apply-schema, safe now).`);

if (APPLY_SCHEMA) {
  console.log("\nApplying schema + backfill...");
  await sql`ALTER TABLE parks ADD COLUMN IF NOT EXISTS designation varchar(100)`;
  await sql`ALTER TABLE parks ADD COLUMN IF NOT EXISTS is_national_park boolean NOT NULL DEFAULT false`;

  // Every row already in the DB today is one of the curated 63 — mark them
  // now, before anything new ever gets inserted.
  await sql`UPDATE parks SET is_national_park = true`;

  for (const b of backfill) {
    await sql`UPDATE parks SET designation = ${b.designation} WHERE park_code = ${b.park_code}`;
  }
  console.log(`Columns added. Backfilled designation + is_national_park=true on ${backfill.length} rows.`);
  console.log("Safe to merge/deploy the scope-aware badges.ts code now. Run --apply-inserts once that's live.");
} else if (APPLY_INSERTS) {
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
  console.log("\nDry run only — re-run with --apply-schema (safe now) or --apply-inserts (after deploy) to write.");
}
