// Server-only helpers behind the admin "Add park" / "Edit park" panels —
// adding a brand-new NPS unit or redesignating one (monument → National Park)
// as a pure data change, with no deploy or app build. Everything that reads
// parks (map, passport, badge scopes, park-type filters, marketing counts)
// derives from the parks table, so beyond the row itself a write here only
// has to bust the cached copies (revalidateParkData).
//
// Guardrails on every write (rules in lib/parkGuards.ts):
//  - typed park-code confirmation for adds, designation and NP-flag changes
//  - explicit acknowledgment when badge holders would lose a badge, or when
//    the coordinates look wrong
//  - compare-and-set against what the admin loaded (no silent overwrites)
//  - a park_changes audit row in the same SQL statement as the write, which
//    the Revert button replays backwards

import { revalidatePath } from 'next/cache';
import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { PARK_TYPE_DEFS, TRACKED_DESIGNATIONS, matchesParkType } from '@parkquest/types';
import { db } from '@/lib/db';
import { parkChanges, parks, userBadges, userProfiles, visits } from '@/lib/db/schema';
import { getEnabledBadges } from '@/lib/badgeDefs';
import { parkInScope } from '@/lib/badges';
import { toNpsCode } from '@/lib/npsCodeMap';
import {
  EDITABLE_FIELDS, changedFields, sameValue,
  type EditableField, type ParkChangeEntry, type ParkGuards, type ParkImpact, type ParkSnapshot,
} from '@/lib/parkGuards';

// ─── Input validation ─────────────────────────────────────────────────────────

export interface ParkInput extends ParkSnapshot {
  park_code: string;
  designation: string;
  latitude: string;
  longitude: string;
}

type Parsed = { ok: true; value: ParkInput } | { ok: false; error: string };

// Static siblings of /api/parks/[park_code] and /api/admin/parks/[park_code] —
// a park with one of these codes would be unreachable at its own URL.
const RESERVED_CODES = new Set(['sync', 'preview', 'changes', 'count', 'activities', 'images', 'topics']);

function str(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

function coord(raw: unknown, label: string, limit: number): string | { error: string } {
  const s = typeof raw === 'number' ? String(raw) : str(raw);
  const n = Number(s);
  if (!s || !Number.isFinite(n)) return { error: `${label} is required — /api/parks hides parks without coordinates` };
  if (Math.abs(n) > limit) return { error: `${label} must be between -${limit} and ${limit}` };
  return s;
}

/**
 * Validates a full park form. `allowedLegacyDesignation` (edits/reverts) lets
 * a row keep a designation it already has (or had), so an unrelated edit isn't
 * blocked — but nothing can be moved *onto* a new untracked designation.
 */
export function parseParkInput(raw: unknown, allowedLegacyDesignation?: string | null): Parsed {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Invalid body' };
  const b = raw as Record<string, unknown>;

  const park_code = str(b.park_code).toLowerCase();
  if (!/^[a-z0-9]{3,10}$/.test(park_code)) return { ok: false, error: 'Park code must be 3–10 lowercase letters/digits (the NPS parkCode, e.g. "chir")' };
  if (RESERVED_CODES.has(park_code)) return { ok: false, error: `"${park_code}" is reserved by an API route — use the real NPS parkCode` };

  const name = str(b.name);
  if (!name || name.length > 255) return { ok: false, error: 'Name is required (max 255 characters)' };

  const states = str(b.states).toUpperCase().replace(/\s+/g, '');
  if (!/^[A-Z]{2}(,[A-Z]{2})*$/.test(states) || states.length > 100) return { ok: false, error: 'States must be comma-separated 2-letter codes, e.g. "AZ" or "CA,NV"' };

  const is_national_park = b.is_national_park === true;
  const designation = str(b.designation);
  if (designation.length > 100) return { ok: false, error: 'Designation is too long (max 100 characters)' };
  // A National Park matches the national_park filter through its flag, so its
  // designation text can be any NPS variant ("National Park & Preserve"...).
  // Anything else has to match a park-type filter, or shipped app builds would
  // never show it on the map or parks list.
  if (!is_national_park && !TRACKED_DESIGNATIONS.includes(designation) && designation !== (allowedLegacyDesignation ?? undefined)) {
    return {
      ok: false,
      error: `"${designation || '(blank)'}" isn't a tracked designation, so the park wouldn't appear in any map/list filter on shipped app builds. ` +
        `Use one of: ${TRACKED_DESIGNATIONS.join(', ')} — or tick "Counts as a National Park". ` +
        `A new designation type is a code change (packages/types/src/parkTypes.ts).`,
    };
  }

  const latitude = coord(b.latitude, 'Latitude', 90);
  if (typeof latitude !== 'string') return { ok: false, error: latitude.error };
  const longitude = coord(b.longitude, 'Longitude', 180);
  if (typeof longitude !== 'string') return { ok: false, error: longitude.error };

  const description = str(b.description) || null;
  const image_url = str(b.image_url) || null;
  if (image_url && !/^https:\/\//.test(image_url)) return { ok: false, error: 'Image URL must start with https://' };

  return { ok: true, value: { park_code, name, states, designation, is_national_park, latitude, longitude, description, image_url } };
}

/** The editable fields of a ParkInput/row, nothing else — the shape park_changes stores. */
export function snapshotOf(src: ParkSnapshot): ParkSnapshot {
  return {
    name: src.name, states: src.states, designation: src.designation, is_national_park: src.is_national_park,
    latitude: src.latitude, longitude: src.longitude, description: src.description, image_url: src.image_url,
  };
}

/** Best-effort snapshot of a half-filled form, so the preview can still run while it fails validation. */
export function looseSnapshot(raw: unknown): ParkSnapshot {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    name: str(b.name), states: str(b.states), designation: str(b.designation) || null,
    is_national_park: b.is_national_park === true,
    latitude: str(b.latitude) || null, longitude: str(b.longitude) || null,
    description: str(b.description) || null, image_url: str(b.image_url) || null,
  };
}

const SNAPSHOT_COLUMNS = {
  name: parks.name, states: parks.states, designation: parks.designation, is_national_park: parks.is_national_park,
  latitude: parks.latitude, longitude: parks.longitude, description: parks.description, image_url: parks.image_url,
};

export async function loadParkSnapshot(parkCode: string): Promise<ParkSnapshot | null> {
  const [row] = await db.select(SNAPSHOT_COLUMNS).from(parks).where(eq(parks.park_code, parkCode)).limit(1);
  return row ?? null;
}

export async function loadParkSnapshots(): Promise<Map<string, ParkSnapshot>> {
  const rows = await db.select({ park_code: parks.park_code, ...SNAPSHOT_COLUMNS }).from(parks);
  return new Map(rows.map(({ park_code, ...snap }) => [park_code, snap]));
}

// ─── NPS lookups ──────────────────────────────────────────────────────────────

interface NpsRaw {
  parkCode: string;
  fullName?: string;
  states?: string;
  designation?: string;
  description?: string;
  latitude?: string;
  longitude?: string;
  images?: { url: string }[];
}

export interface NpsUnit {
  park_code: string;
  name: string;
  states: string;
  designation: string;
  latitude: string;
  longitude: string;
  description: string;
  image_url: string;
}

function toUnit(p: NpsRaw, parkCode = p.parkCode): NpsUnit {
  return {
    park_code: parkCode,
    name: p.fullName?.trim() ?? '',
    states: p.states?.trim() ?? '',
    designation: p.designation?.trim() ?? '',
    latitude: p.latitude?.trim() ?? '',
    longitude: p.longitude?.trim() ?? '',
    description: p.description?.trim() ?? '',
    image_url: p.images?.[0]?.url ?? '',
  };
}

function npsKey(): string {
  const key = process.env.NPS_API_KEY;
  if (!key) throw new Error('NPS_API_KEY not set');
  return key;
}

/**
 * One unit by our park_code (mapped through npsCodeMap), or null if NPS
 * doesn't list it (yet). `hourly` reuses a cached response — fine for the
 * coordinate check, which runs on every preview keystroke.
 */
export async function fetchNpsUnit(parkCode: string, opts: { hourly?: boolean } = {}): Promise<NpsUnit | null> {
  const npsCode = toNpsCode(parkCode);
  const res = await fetch(
    `https://developer.nps.gov/api/v1/parks?parkCode=${encodeURIComponent(npsCode)}&api_key=${npsKey()}`,
    opts.hourly ? { next: { revalidate: 3600 } } : { cache: 'no-store' },
  );
  if (!res.ok) throw new Error(`NPS API error: ${res.status}`);
  const { data } = (await res.json()) as { data: NpsRaw[] };
  const hit = data.find(p => p.parkCode === npsCode);
  return hit ? toUnit(hit, parkCode) : null;
}

/**
 * NPS units not yet in the parks table whose designation the app could show —
 * a tracked designation, or any "National Park" variant. A starting point for
 * the Add park form, not an auto-import: nothing is written from this list.
 */
export async function fetchNpsCandidates(): Promise<NpsUnit[]> {
  const res = await fetch(`https://developer.nps.gov/api/v1/parks?limit=600&api_key=${npsKey()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`NPS API error: ${res.status}`);
  const { data } = (await res.json()) as { data: NpsRaw[] };

  const dbRows = await db.select({ park_code: parks.park_code }).from(parks);
  const covered = new Set(dbRows.map(r => toNpsCode(r.park_code)));

  return data
    .filter(p => !covered.has(p.parkCode))
    .filter(p => {
      const d = p.designation?.trim() ?? '';
      return TRACKED_DESIGNATIONS.includes(d) || /\bNational Parks?\b/.test(d);
    })
    .map(p => toUnit(p))
    .sort((a, b) => a.designation.localeCompare(b.designation) || a.name.localeCompare(b.name));
}

// ─── Coordinate sanity ────────────────────────────────────────────────────────

// [minLat, maxLat, minLng, maxLng] — loose boxes around every place NPS has a unit.
const US_BOXES: [number, number, number, number][] = [
  [24, 50, -125, -66],         // contiguous US (incl. the Keys / Dry Tortugas)
  [51, 72, -180, -129],        // Alaska
  [51, 55, 172, 180],          // Aleutians west of 180°
  [18, 23, -161, -154],        // Hawaii
  [17.5, 18.8, -68, -64.4],    // Puerto Rico + U.S. Virgin Islands
  [13, 21, 144, 146.5],        // Guam + Northern Mariana Islands
  [-14.6, -11, -171.2, -168],  // American Samoa
];

// Generous on purpose: NPS places a unit at one point, and the biggest parks
// span hundreds of km, so this only catches typos — not a deliberate move.
const FAR_FROM_NPS_KM = 50;

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(bLat - aLat) / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

async function checkCoordinates(parkCode: string, lat: string | null, lng: string | null): Promise<string | null> {
  if (!lat || !lng) return null; // parseParkInput rejects missing coordinates on its own
  const la = Number(lat), lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;

  if (!US_BOXES.some(([a, b, c, d]) => la >= a && la <= b && lo >= c && lo <= d)) {
    return `${la}, ${lo} is outside the US and its territories — latitude and longitude swapped or mistyped?`;
  }
  const nps = await fetchNpsUnit(parkCode, { hourly: true }).catch(() => null);
  const nLa = Number(nps?.latitude), nLo = Number(nps?.longitude);
  if (nps?.latitude && nps.longitude && Number.isFinite(nLa) && Number.isFinite(nLo)) {
    const km = distanceKm(la, lo, nLa, nLo);
    if (km > FAR_FROM_NPS_KM) {
      return `${Math.round(km)} km from where NPS places this park (${nps.latitude}, ${nps.longitude}).`;
    }
  }
  return null;
}

// ─── Impact preview ───────────────────────────────────────────────────────────

export async function computeParkImpact(proposed: {
  park_code: string;
  designation: string;
  is_national_park: boolean;
}): Promise<ParkImpact> {
  const [allParks, badgeDefs] = await Promise.all([
    db.select({ park_code: parks.park_code, designation: parks.designation, is_national_park: parks.is_national_park }).from(parks),
    getEnabledBadges(),
  ]);

  const existing = allParks.find(p => p.park_code === proposed.park_code) ?? null;
  const next = { park_code: proposed.park_code, designation: proposed.designation, is_national_park: proposed.is_national_park };
  const after = existing ? allParks.map(p => (p.park_code === next.park_code ? next : p)) : [...allParks, next];

  const typeChanges = PARK_TYPE_DEFS.map(def => ({
    key: def.key,
    label: def.label,
    before: allParks.filter(p => matchesParkType(def, p)).length,
    after: after.filter(p => matchesParkType(def, p)).length,
  })).filter(t => t.before !== t.after);

  const growing = badgeDefs.filter(b =>
    b.conditions.some(c => {
      if (c.type !== 'all_parks_visited') return false;
      const scope = c.scope ?? 'national_park';
      return !(existing && parkInScope(scope, existing)) && parkInScope(scope, next);
    }),
  );

  let atRiskBadges: ParkImpact['atRiskBadges'] = [];
  if (growing.length > 0) {
    const [holders, visitedHere] = await Promise.all([
      db.select({ badge_id: userBadges.badge_id, clerk_user_id: userBadges.clerk_user_id, username: userProfiles.username })
        .from(userBadges)
        .leftJoin(userProfiles, eq(userProfiles.clerk_user_id, userBadges.clerk_user_id))
        .where(inArray(userBadges.badge_id, growing.map(b => b.badge_id))),
      existing
        ? db.selectDistinct({ clerk_user_id: visits.clerk_user_id }).from(visits)
            .where(and(eq(visits.park_code, next.park_code), eq(visits.is_bucket_list, false), isNotNull(visits.visited_date)))
        : Promise.resolve([] as { clerk_user_id: string }[]),
    ]);
    const safe = new Set(visitedHere.map(v => v.clerk_user_id));
    atRiskBadges = growing
      .map(b => ({
        badge_id: b.badge_id,
        name: b.name,
        holders: holders
          .filter(h => h.badge_id === b.badge_id && !safe.has(h.clerk_user_id))
          .map(h => ({ clerk_user_id: h.clerk_user_id, username: h.username })),
      }))
      .filter(b => b.holders.length > 0);
  }

  const np = (rows: { is_national_park: boolean }[]) => rows.filter(p => p.is_national_park).length;
  return {
    isNew: !existing,
    nationalParks: { before: np(allParks), after: np(after) },
    typeChanges,
    atRiskBadges,
  };
}

/** Everything the guards need to know about one proposed write. `current` null = adding a park. */
export async function evaluateParkWrite(parkCode: string, next: ParkSnapshot, current: ParkSnapshot | null): Promise<ParkGuards> {
  const changed = current ? changedFields(current, next) : [...EDITABLE_FIELDS];
  const structural = !current || changed.includes('designation') || changed.includes('is_national_park');
  const coordsChanged = !current || changed.includes('latitude') || changed.includes('longitude');
  const [impact, coordinateWarning] = await Promise.all([
    computeParkImpact({ park_code: parkCode, designation: next.designation ?? '', is_national_park: next.is_national_park }),
    coordsChanged ? checkCoordinates(parkCode, next.latitude, next.longitude) : Promise.resolve(null),
  ]);
  return { changedFields: changed, structural, impact, coordinateWarning };
}

// ─── Logged writes ────────────────────────────────────────────────────────────
// Each write and its park_changes row are one SQL statement (a data-modifying
// CTE), so a change can never land without its log row, or vice versa.

/** Inserts a park + its 'create' log row. ok:false = the park code is already taken. */
export async function createParkLogged(input: ParkInput, adminId: string): Promise<{ ok: true; changeId: number } | { ok: false }> {
  const after = snapshotOf(input);
  const res = await db.execute(sql`
    WITH ins AS (
      INSERT INTO parks (park_code, name, states, designation, is_national_park, latitude, longitude, description, image_url)
      VALUES (${input.park_code}, ${after.name}, ${after.states}, ${after.designation}, ${after.is_national_park},
              ${after.latitude}, ${after.longitude}, ${after.description}, ${after.image_url})
      ON CONFLICT (park_code) DO NOTHING
      RETURNING park_code
    )
    INSERT INTO park_changes (park_code, action, before, after, changed_fields, admin_clerk_user_id)
    SELECT park_code, 'create', NULL::jsonb, ${JSON.stringify(after)}::jsonb, ${JSON.stringify(EDITABLE_FIELDS)}::jsonb, ${adminId}
    FROM ins
    RETURNING id
  `);
  const id = (res.rows[0] as { id?: number } | undefined)?.id;
  return id ? { ok: true, changeId: id } : { ok: false };
}

/**
 * Applies `set` only if every editable field still equals `before`
 * (compare-and-set: two admins, or an admin and an NPS sync, can't silently
 * overwrite each other), and logs it. ok:false = the row changed underneath
 * and nothing was written. No-op sets write nothing and log nothing.
 */
export async function updateParkLogged(opts: {
  park_code: string;
  before: ParkSnapshot;
  set: Partial<ParkSnapshot>;
  action: 'update' | 'sync' | 'revert';
  adminId: string;
  revertsChangeId?: number;
}): Promise<{ ok: true; changeId: number | null; after: ParkSnapshot } | { ok: false }> {
  const { park_code, before, set, action, adminId, revertsChangeId } = opts;
  const changed = changedFields(before, { ...before, ...set });
  if (changed.length === 0) return { ok: true, changeId: null, after: before };

  // after = exactly what's written: fields sameValue() calls equal keep their stored value.
  const after: ParkSnapshot = { ...before };
  for (const f of changed) (after as Record<EditableField, unknown>)[f] = set[f];

  const assignments = sql.join(changed.map(f => sql`${sql.identifier(f)} = ${after[f]}`), sql`, `);
  const unchanged = sql.join(EDITABLE_FIELDS.map(f => sql`${sql.identifier(f)} IS NOT DISTINCT FROM ${before[f]}`), sql` AND `);

  const res = await db.execute(sql`
    WITH upd AS (
      UPDATE parks SET ${assignments}
      WHERE park_code = ${park_code} AND ${unchanged}
      RETURNING park_code
    )
    INSERT INTO park_changes (park_code, action, before, after, changed_fields, admin_clerk_user_id, reverts_change_id)
    SELECT park_code, ${action}, ${JSON.stringify(before)}::jsonb, ${JSON.stringify(after)}::jsonb,
           ${JSON.stringify(changed)}::jsonb, ${adminId}, ${revertsChangeId ?? null}::int
    FROM upd
    RETURNING id
  `);
  const id = (res.rows[0] as { id?: number } | undefined)?.id;
  return id ? { ok: true, changeId: id, after } : { ok: false };
}

// ─── Change log + revert ──────────────────────────────────────────────────────

export async function listParkChanges(opts: { park_code?: string; limit: number }): Promise<ParkChangeEntry[]> {
  const rows = await db
    .select({
      id: parkChanges.id,
      park_code: parkChanges.park_code,
      park_name: parks.name,
      action: parkChanges.action,
      before: parkChanges.before,
      after: parkChanges.after,
      changed_fields: parkChanges.changed_fields,
      admin_clerk_user_id: parkChanges.admin_clerk_user_id,
      admin_username: userProfiles.username,
      reverts_change_id: parkChanges.reverts_change_id,
      reverted_by: sql<number | null>`(SELECT max(r.id) FROM park_changes r WHERE r.reverts_change_id = ${parkChanges.id})`,
      created_at: parkChanges.created_at,
    })
    .from(parkChanges)
    .leftJoin(parks, eq(parks.park_code, parkChanges.park_code))
    .leftJoin(userProfiles, eq(userProfiles.clerk_user_id, parkChanges.admin_clerk_user_id))
    .where(opts.park_code ? eq(parkChanges.park_code, opts.park_code) : undefined)
    .orderBy(desc(parkChanges.id))
    .limit(opts.limit);

  return rows.map(r => ({
    ...r,
    action: r.action as ParkChangeEntry['action'],
    changed_fields: r.changed_fields as EditableField[],
    created_at: r.created_at.toISOString(),
  }));
}

type RevertPlan =
  | { ok: true; park_code: string; current: ParkSnapshot; next: ParkInput }
  | { ok: false; status: number; error: string };

/**
 * Restores the fields one change touched to their values before it — only
 * if they still hold exactly what that change wrote, so reverting an old
 * change can never clobber a later one. Everything else is left alone.
 */
export async function planRevert(changeId: number): Promise<RevertPlan> {
  const [change] = await db.select().from(parkChanges).where(eq(parkChanges.id, changeId)).limit(1);
  if (!change) return { ok: false, status: 404, error: 'Change not found' };
  if (change.action === 'create' || !change.before) {
    return { ok: false, status: 400, error: "Adding a park can't be reverted — parks are never deleted (visits and posts reference them). Edit it instead." };
  }

  const current = await loadParkSnapshot(change.park_code);
  if (!current) return { ok: false, status: 404, error: 'Park not found' };

  const fields = (change.changed_fields as string[]).filter((f): f is EditableField => (EDITABLE_FIELDS as readonly string[]).includes(f));
  const since = fields.filter(f => !sameValue(f, current[f], change.after[f]));
  if (since.length > 0) {
    return {
      ok: false,
      status: 409,
      error: `Can't revert: ${since.join(', ')} changed again after this edit. Revert the later change first, or fix it with Edit park.`,
    };
  }

  const target: ParkSnapshot = { ...current };
  for (const f of fields) (target as Record<EditableField, unknown>)[f] = change.before[f];
  const parsed = parseParkInput({ park_code: change.park_code, ...target }, target.designation);
  if (!parsed.ok) return { ok: false, status: 400, error: `The old values no longer pass validation: ${parsed.error}` };

  return { ok: true, park_code: change.park_code, current, next: parsed.value };
}

// ─── Cache busting ────────────────────────────────────────────────────────────

/**
 * /api/parks and /api/parks/count are ISR-cached for a day, and clients cache
 * them for another day on top. Revalidating the server copy here keeps an
 * admin add/edit to one day end to end instead of up to two — immediacy isn't
 * the goal, a day is fine.
 */
export function revalidateParkData(parkCode: string) {
  revalidatePath('/api/parks');
  revalidatePath('/api/parks/count');
  revalidatePath(`/api/parks/${parkCode}`);
  revalidatePath('/', 'layout');
}
