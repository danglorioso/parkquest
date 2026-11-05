import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { parks, type ParkSnapshot } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/admin';
import { toNpsCode, localCodesForNpsCode } from '@/lib/npsCodeMap';
import { loadParkSnapshots, updateParkLogged } from '@/lib/parkAdmin';

const SYNCABLE_FIELDS = ['name', 'states', 'description', 'latitude', 'longitude', 'image_url'] as const;
type SyncField = (typeof SYNCABLE_FIELDS)[number];

function isSyncField(x: string): x is SyncField {
  return (SYNCABLE_FIELDS as readonly string[]).includes(x);
}

// Sequoia (sequ) and Kings Canyon (king) are administered together as one
// NPS record ("seki") but are kept as two distinct pins/park pages in the
// app — never let that shared record collapse their identity into a single
// name/location/description. Only image_url and states (identical either
// way) are safe to pull from a shared record.
const IDENTITY_FIELDS: SyncField[] = ['name', 'latitude', 'longitude', 'description'];

interface NpsRaw {
  parkCode: string;
  fullName?: string;
  designation?: string;
  states?: string;
  description?: string;
  latitude?: string;
  longitude?: string;
  images?: { url: string }[];
}

interface DbParkRow {
  park_code: string;
  name: string;
  designation: string | null;
  states: string;
  description: string | null;
  latitude: string | null;
  longitude: string | null;
  image_url: string | null;
}

export interface Change {
  park_code: string;
  park_name: string;
  field: SyncField;
  old_value: string | null;
  new_value: string;
}

/**
 * NPS and ParkQuest disagree on a park's designation — almost always a
 * redesignation one side hasn't caught up with yet (Chiricahua: promoted here
 * the day the act was signed, NPS still listed "National Monument"). Name sync
 * pauses for these rows so a lagging NPS fullName can't undo a rename; an
 * admin resolves it with Edit park, which never runs automatically.
 */
export interface DesignationDrift {
  park_code: string;
  park_name: string;
  db_designation: string | null;
  nps_designation: string;
  nps_name: string | null;
}

function designationDrifted(row: DbParkRow, nps: NpsRaw, shared: boolean): boolean {
  const npsDesignation = nps.designation?.trim();
  return !shared && !!npsDesignation && npsDesignation !== (row.designation ?? '');
}

async function fetchNpsByCode(): Promise<Map<string, NpsRaw>> {
  const apiKey = process.env.NPS_API_KEY;
  if (!apiKey) throw new Error('NPS_API_KEY not set');
  const res = await fetch(`https://developer.nps.gov/api/v1/parks?limit=500&api_key=${apiKey}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`NPS API error: ${res.status}`);
  const { data } = (await res.json()) as { data: NpsRaw[] };
  return new Map(data.map((p) => [p.parkCode, p]));
}

// NPS trims trailing zeros on coordinates (e.g. "25.490587" vs our stored
// "25.49058700") — compare numerically so that formatting-only precision
// noise doesn't show up as a change on every single check.
function valuesEqual(field: SyncField, oldValue: string | null, newValue: string): boolean {
  if (oldValue === null) return false;
  if (field === 'latitude' || field === 'longitude') {
    const a = Number(oldValue), b = Number(newValue);
    if (Number.isFinite(a) && Number.isFinite(b)) return a === b;
  }
  return oldValue === newValue;
}

function fieldValue(field: SyncField, nps: NpsRaw): string | null {
  switch (field) {
    case 'name': return nps.fullName?.trim() || null;
    case 'states': return nps.states?.trim() || null;
    case 'description': return nps.description?.trim() || null;
    case 'latitude': return nps.latitude?.trim() || null;
    case 'longitude': return nps.longitude?.trim() || null;
    case 'image_url': return nps.images?.[0]?.url ?? null;
  }
}

async function getDbParks(): Promise<DbParkRow[]> {
  return db.select({
    park_code: parks.park_code, name: parks.name, designation: parks.designation, states: parks.states,
    description: parks.description, latitude: parks.latitude, longitude: parks.longitude,
    image_url: parks.image_url,
  }).from(parks);
}

function diffOne(row: DbParkRow, nps: NpsRaw, shared: boolean): Change[] {
  const changes: Change[] = [];
  const drifted = designationDrifted(row, nps, shared);
  for (const field of SYNCABLE_FIELDS) {
    if (shared && IDENTITY_FIELDS.includes(field)) continue;
    if (drifted && field === 'name') continue;
    const newValue = fieldValue(field, nps);
    if (newValue === null) continue; // never overwrite with a blank
    const oldValue = row[field];
    if (valuesEqual(field, oldValue ?? null, newValue)) continue;
    changes.push({ park_code: row.park_code, park_name: row.name, field, old_value: oldValue ?? null, new_value: newValue });
  }
  return changes;
}

// GET — preview: diff every park in the DB against a fresh NPS pull. Nothing
// is written; the admin panel shows this list and lets an admin pick which
// changes to apply.
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  try {
    const [npsByCode, dbParks] = await Promise.all([fetchNpsByCode(), getDbParks()]);
    const changes: Change[] = [];
    const drift: DesignationDrift[] = [];
    for (const row of dbParks) {
      const npsCode = toNpsCode(row.park_code);
      const nps = npsByCode.get(npsCode);
      if (!nps) continue; // NPS dropped/renamed this code — needs manual review, not auto-sync
      const shared = localCodesForNpsCode(npsCode).length > 1;
      changes.push(...diffOne(row, nps, shared));
      if (designationDrifted(row, nps, shared)) {
        drift.push({
          park_code: row.park_code, park_name: row.name, db_designation: row.designation,
          nps_designation: nps.designation!.trim(), nps_name: nps.fullName?.trim() || null,
        });
      }
    }
    return NextResponse.json({ changes, drift });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Sync check failed' }, { status: 500 });
  }
}

// POST — apply a set of changes an admin confirmed from the GET preview.
// Re-fetches NPS + the DB right before writing rather than trusting the
// echoed preview values, since a confirmation click can land minutes later.
// Writes go through updateParkLogged — one compare-and-set + park_changes row
// per park — so a sync apply shows up in the change log and can be reverted.
// No cache revalidation on purpose: NPS metadata drift reaching the app within
// the normal one-day cache window is fine.
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const body = (await request.json().catch(() => null)) as { changes?: { park_code: string; field: string; new_value: string }[] } | null;
  if (!body?.changes?.length) return NextResponse.json({ error: 'No changes provided' }, { status: 400 });

  let npsByCode: Map<string, NpsRaw>;
  let dbParks: DbParkRow[];
  let snapshots: Map<string, ParkSnapshot>;
  try {
    [npsByCode, dbParks, snapshots] = await Promise.all([fetchNpsByCode(), getDbParks(), loadParkSnapshots()]);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Sync failed' }, { status: 500 });
  }
  const dbByCode = new Map(dbParks.map((r) => [r.park_code, r]));

  const setByPark = new Map<string, Partial<ParkSnapshot>>();
  const skipped: string[] = [];

  for (const change of body.changes) {
    if (!isSyncField(change.field)) { skipped.push(`${change.park_code}.${change.field}: invalid field`); continue; }
    const row = dbByCode.get(change.park_code);
    if (!row) { skipped.push(`${change.park_code}: park not found`); continue; }

    const npsCode = toNpsCode(change.park_code);
    const nps = npsByCode.get(npsCode);
    if (!nps) { skipped.push(`${change.park_code}: NPS record missing`); continue; }

    const shared = localCodesForNpsCode(npsCode).length > 1;
    if (shared && IDENTITY_FIELDS.includes(change.field)) { skipped.push(`${change.park_code}.${change.field}: identity field on a shared NPS record`); continue; }
    if (change.field === 'name' && designationDrifted(row, nps, shared)) { skipped.push(`${change.park_code}.name: NPS designation differs — rename via Edit park`); continue; }

    const liveValue = fieldValue(change.field, nps);
    if (liveValue === null || !valuesEqual(change.field, change.new_value, liveValue)) { skipped.push(`${change.park_code}.${change.field}: value changed since preview, skipped for safety`); continue; }
    if (valuesEqual(change.field, row[change.field] ?? null, liveValue)) { skipped.push(`${change.park_code}.${change.field}: already up to date`); continue; }

    setByPark.set(change.park_code, { ...setByPark.get(change.park_code), [change.field]: liveValue });
  }

  let applied = 0;
  for (const [park_code, set] of setByPark) {
    const before = snapshots.get(park_code);
    const result = before && await updateParkLogged({ park_code, before, set, action: 'sync', adminId: admin.id });
    if (result && result.ok) applied += Object.keys(set).length;
    else skipped.push(`${park_code}: park changed during sync, skipped`);
  }

  return NextResponse.json({ applied, skipped });
}
