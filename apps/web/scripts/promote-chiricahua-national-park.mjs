/**
 * Chiricahua National Monument → Chiricahua National Park (64th National
 * Park, Chiricahua National Park Act signed 2026-10-20). Same park_code
 * (`chir`), same boundaries — NPS keeps codes on redesignation, so every
 * existing visit/post/badge reference stays valid.
 *
 * Flips the curated `is_national_park` flag (which drives the National Parks
 * badge scope, passport grid, map defaults and profile "X / N" counts) and
 * moves the row out of the 'monument' designation scope.
 *
 * Note: the NPS API may still report the old fullName for a while — the admin
 * parks sync preview will offer to rename it back; don't accept that change.
 *
 * No flags = dry run, prints the before/after, writes nothing.
 *   --apply   Applies the update.
 * Requires DATABASE_URL in .env.local
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

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) throw new Error("DATABASE_URL not set");

const APPLY = process.argv.includes("--apply");

const PARK_CODE = "chir";
const NEW_NAME = "Chiricahua National Park";
const NEW_DESIGNATION = "National Park";

const { neon } = await import("@neondatabase/serverless");
const sql = neon(DATABASE_URL);

const [before] = await sql`
  SELECT park_code, name, designation, is_national_park FROM parks WHERE park_code = ${PARK_CODE}
`;
if (!before) throw new Error(`No parks row for ${PARK_CODE}`);

const [{ count: npCount }] = await sql`SELECT count(*)::int AS count FROM parks WHERE is_national_park`;

console.log("Before:", before);
console.log("After: ", { park_code: PARK_CODE, name: NEW_NAME, designation: NEW_DESIGNATION, is_national_park: true });
console.log(`National Parks count: ${npCount} → ${before.is_national_park ? npCount : npCount + 1}`);

if (APPLY) {
  await sql`
    UPDATE parks
    SET name = ${NEW_NAME}, designation = ${NEW_DESIGNATION}, is_national_park = true
    WHERE park_code = ${PARK_CODE}
  `;
  const [after] = await sql`
    SELECT park_code, name, designation, is_national_park FROM parks WHERE park_code = ${PARK_CODE}
  `;
  console.log("\nApplied:", after);
} else {
  console.log("\nDry run only — re-run with --apply to write.");
}
