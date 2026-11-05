'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, Download, RotateCcw, RefreshCw } from 'lucide-react';
import { TRACKED_DESIGNATIONS } from '@parkquest/types';
import { CollapsibleCard } from '../CollapsibleCard';
import type { NpsUnit } from '@/lib/parkAdmin';
import {
  badgeLossCount, missingAcks,
  type EditableField, type ParkChangeEntry, type ParkGuards, type ParkImpact, type ParkSnapshot,
} from '@/lib/parkGuards';

// Add park / Edit park panels and the park change log — new NPS units and
// redesignations (monument → National Park) as data changes, reaching web and
// shipped app builds without a deploy. The guardrails (typed confirmation,
// acknowledgments, compare-and-set, audit log) are enforced server-side in
// lib/parkAdmin.ts; this UI mirrors them (lib/parkGuards.ts) so Save only
// enables once they're met.

const fieldClass =
  'w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-mute focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60';

const btnBase =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50';
const btnSecondary = `${btnBase} border-hairline bg-surface text-ink hover:bg-surface-alt`;
const btnPrimary = `${btnBase} border-primary bg-primary text-white hover:opacity-90`;

// Every panel on the page refetches when any of them writes a park.
const PARK_CHANGED_EVENT = 'pq-park-changed';
function announceParkChange() {
  window.dispatchEvent(new Event(PARK_CHANGED_EVENT));
}
function useParkChangeTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick(t => t + 1);
    window.addEventListener(PARK_CHANGED_EVENT, bump);
    return () => window.removeEventListener(PARK_CHANGED_EVENT, bump);
  }, []);
  return tick;
}

const FIELD_LABELS: Record<EditableField, string> = {
  name: 'Name', states: 'States', designation: 'Designation', is_national_park: 'National Park',
  latitude: 'Latitude', longitude: 'Longitude', description: 'Description', image_url: 'Image URL',
};

interface FormState {
  park_code: string;
  name: string;
  states: string;
  designation: string;
  is_national_park: boolean;
  latitude: string;
  longitude: string;
  description: string;
  image_url: string;
}

const EMPTY: FormState = {
  park_code: '', name: '', states: '', designation: '', is_national_park: false,
  latitude: '', longitude: '', description: '', image_url: '',
};

function fromUnit(u: NpsUnit): FormState {
  return {
    park_code: u.park_code, name: u.name, states: u.states, designation: u.designation,
    // NPS spells it several ways ("National Park & Preserve", "National Parks")
    is_national_park: /\bNational Parks?\b/.test(u.designation),
    latitude: u.latitude, longitude: u.longitude, description: u.description, image_url: u.image_url,
  };
}

function fromPark(park_code: string, p: ParkSnapshot): FormState {
  return {
    park_code, name: p.name, states: p.states, designation: p.designation ?? '', is_national_park: p.is_national_park,
    latitude: p.latitude ?? '', longitude: p.longitude ?? '', description: p.description ?? '', image_url: p.image_url ?? '',
  };
}

async function readError(res: Response | null, fallback: string): Promise<{ error: string; code?: string }> {
  const body = await res?.json().catch(() => null);
  return { error: body?.error ?? fallback, code: body?.code };
}

// ─── Preview + acknowledgments ────────────────────────────────────────────────

/**
 * Debounced read-only preview of the guards for the current form. `pending`
 * stays true until the preview for exactly these values lands, so Save waits
 * for it instead of acting on a stale (or missing) one.
 */
function usePreview(mode: 'add' | 'edit', form: FormState, enabled: boolean, tick: number) {
  const active = enabled && /^[a-z0-9]{3,10}$/.test(form.park_code);
  const key = JSON.stringify([mode, form, tick]);
  const [result, setResult] = useState<{ key: string; guards: ParkGuards | null; invalid: string | null } | null>(null);

  useEffect(() => {
    if (!active) return;
    const [m, f] = JSON.parse(key) as [string, FormState];
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      const res = await fetch('/api/admin/parks/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: m, form: f }),
        signal: ctrl.signal,
      }).catch(() => null);
      if (ctrl.signal.aborted) return;
      if (!res?.ok) {
        setResult({ key, guards: null, invalid: (await readError(res, 'Preview failed')).error });
        return;
      }
      const body = await res.json();
      setResult({ key, guards: body.guards ?? null, invalid: body.invalid ?? null });
    }, 400);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [key, active]);

  if (!active) return { guards: null, invalid: null, pending: false };
  return result?.key === key ? { ...result, pending: false } : { guards: null, invalid: null, pending: true };
}

interface Acks { confirm_code: string; acknowledge_badge_loss: boolean; acknowledge_far_coordinates: boolean }
const NO_ACKS: Acks = { confirm_code: '', acknowledge_badge_loss: false, acknowledge_far_coordinates: false };

/**
 * Acknowledgments reset whenever what they acknowledge changes (a different
 * coordinate warning, different badge holders, structural or not) — ticking a
 * box for one warning never carries over to another.
 */
function useAcks(guards: ParkGuards | null) {
  const key = guards
    ? JSON.stringify([guards.structural, guards.coordinateWarning, guards.impact.atRiskBadges.map(b => [b.badge_id, b.holders.length])])
    : '';
  const [state, setState] = useState<{ key: string; acks: Acks }>({ key: '', acks: NO_ACKS });
  const acks = state.key === key ? state.acks : NO_ACKS;
  return {
    acks,
    update: (patch: Partial<Acks>) => setState({ key, acks: { ...acks, ...patch } }),
    reset: () => setState({ key: '', acks: NO_ACKS }),
  };
}

function ImpactSummary({ impact }: { impact: ParkImpact }) {
  const { nationalParks, typeChanges, atRiskBadges } = impact;
  const npChanged = nationalParks.before !== nationalParks.after;
  const otherTypes = typeChanges.filter(t => t.key !== 'national_park');

  return (
    <div>
      <p className="font-semibold">When you save</p>
      <ul className="mt-1 list-disc pl-5 text-ink-soft">
        <li>
          National Parks: {npChanged ? <><b className="text-ink">{nationalParks.before} → {nationalParks.after}</b> (passport grid, map defaults, &ldquo;all {nationalParks.after}&rdquo; copy)</> : `${nationalParks.after}, unchanged`}
        </li>
        {otherTypes.map(t => (
          <li key={t.key}>{t.label}: {t.before} → {t.after}</li>
        ))}
        {impact.isNew && typeChanges.length === 0 && (
          <li className="text-red-700">Matches no park-type filter, so it won&apos;t show on the map or parks list</li>
        )}
      </ul>
      {atRiskBadges.map(b => (
        <p key={b.badge_id} className="mt-2 text-red-700">
          <b>{b.name}</b>: {b.holders.length} holder{b.holders.length === 1 ? '' : 's'} haven&apos;t visited this park and will lose the badge (and its feed post) the next time their badges load —{' '}
          {b.holders.map(h => (h.username ? `@${h.username}` : h.clerk_user_id)).join(', ')}
        </p>
      ))}
    </div>
  );
}

/** Impact, plus whatever this particular write needs confirmed before Save enables. */
function GuardChecklist({ parkCode, guards, acks, update }: {
  parkCode: string;
  guards: ParkGuards;
  acks: Acks;
  update: (patch: Partial<Acks>) => void;
}) {
  const losing = badgeLossCount(guards.impact);
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-hairline bg-surface-alt p-3 text-sm text-ink">
      <ImpactSummary impact={guards.impact} />
      {guards.coordinateWarning && (
        <label className="flex cursor-pointer items-start gap-2">
          <input type="checkbox" className="mt-1" checked={acks.acknowledge_far_coordinates} onChange={e => update({ acknowledge_far_coordinates: e.target.checked })} />
          <span><span className="text-red-700">Coordinates look off: {guards.coordinateWarning}</span> They&apos;re correct anyway.</span>
        </label>
      )}
      {losing > 0 && (
        <label className="flex cursor-pointer items-start gap-2">
          <input type="checkbox" className="mt-1" checked={acks.acknowledge_badge_loss} onChange={e => update({ acknowledge_badge_loss: e.target.checked })} />
          <span>I understand {losing} badge holder{losing === 1 ? '' : 's'} will lose a badge and its feed post. This can&apos;t be undone by reverting.</span>
        </label>
      )}
      {guards.structural && (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-ink-soft">
            {guards.impact.isNew ? 'Adding a park' : 'This changes the designation or National Park status'} — type <code className="font-mono">{parkCode}</code> to confirm
          </span>
          <input
            className={`${fieldClass} max-w-[180px] font-mono`}
            value={acks.confirm_code}
            onChange={e => update({ confirm_code: e.target.value })}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
      )}
    </div>
  );
}

/** Save is allowed once the preview is in, the form validates, and every guard is acknowledged. */
function canWrite(parkCode: string, preview: { guards: ParkGuards | null; invalid: string | null; pending: boolean }, acks: Acks) {
  return !preview.pending && !preview.invalid && !!preview.guards && missingAcks(parkCode, preview.guards, acks).length === 0;
}

// ─── Shared fields ────────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-ink-soft">{label}</span>
      {children}
      {hint && <span className="text-xs text-ink-mute">{hint}</span>}
    </label>
  );
}

function ParkFields({ form, set, codeLocked }: {
  form: FormState;
  set: (patch: Partial<FormState>) => void;
  codeLocked: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label="Park code" hint={codeLocked ? 'Fixed — visits, posts and badges reference it' : 'NPS parkCode, lowercase'}>
        <input className={fieldClass} value={form.park_code} disabled={codeLocked} onChange={e => set({ park_code: e.target.value.trim().toLowerCase() })} />
      </Field>
      <Field label="Name">
        <input className={fieldClass} value={form.name} onChange={e => set({ name: e.target.value })} />
      </Field>
      <Field label="Designation" hint={form.is_national_park ? 'Any NPS spelling is fine for a National Park' : `Must be one of: ${TRACKED_DESIGNATIONS.join(', ')}`}>
        <input className={fieldClass} list="pq-designations" value={form.designation} onChange={e => set({ designation: e.target.value })} />
      </Field>
      <Field label="States" hint='Comma-separated, e.g. "AZ" or "CA,NV"'>
        <input className={fieldClass} value={form.states} onChange={e => set({ states: e.target.value })} />
      </Field>
      <Field label="Latitude">
        <input className={fieldClass} value={form.latitude} onChange={e => set({ latitude: e.target.value })} />
      </Field>
      <Field label="Longitude">
        <input className={fieldClass} value={form.longitude} onChange={e => set({ longitude: e.target.value })} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Image URL">
          <input className={fieldClass} value={form.image_url} onChange={e => set({ image_url: e.target.value })} />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Description">
          <textarea className={`${fieldClass} min-h-[80px]`} value={form.description} onChange={e => set({ description: e.target.value })} />
        </Field>
      </div>
      <label className="flex cursor-pointer items-start gap-2 sm:col-span-2">
        <input type="checkbox" className="mt-1" checked={form.is_national_park} onChange={e => set({ is_national_park: e.target.checked })} />
        <span className="text-sm text-ink">
          Counts as a National Park
          <span className="block text-xs text-ink-mute">Puts it in the passport grid, the National Parks filter and badge scope, and the &ldquo;all N&rdquo; counts.</span>
        </span>
      </label>
      <datalist id="pq-designations">
        {['National Park', ...TRACKED_DESIGNATIONS].map(d => <option key={d} value={d} />)}
      </datalist>
    </div>
  );
}

function SavedNote({ code, verb }: { code: string; verb: string }) {
  return (
    <p className="text-sm text-ink">
      {verb} (<Link href={`/parks/${code}`} className="font-semibold text-primary hover:underline">view park</Link>). It reaches the map, passport, and app within a day as cached copies refresh — no deploy or build needed. Undo it from the change log.
    </p>
  );
}

// ─── Add park ─────────────────────────────────────────────────────────────────

export function AddParkPanel() {
  const router = useRouter();
  const tick = useParkChangeTick();
  const [code, setCode] = useState('');
  const [form, setForm] = useState<FormState | null>(null);
  const [candidates, setCandidates] = useState<NpsUnit[] | null>(null);
  const [busy, setBusy] = useState<'lookup' | 'candidates' | 'save' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedCode, setSavedCode] = useState<string | null>(null);
  const preview = usePreview('add', form ?? EMPTY, form !== null, tick);
  const { acks, update, reset } = useAcks(preview.guards);

  const set = (patch: Partial<FormState>) => setForm(f => (f ? { ...f, ...patch } : f));

  const lookup = async (c: string) => {
    const q = c.trim().toLowerCase();
    if (!q) return;
    setBusy('lookup'); setError(null); setSavedCode(null);
    const res = await fetch(`/api/admin/parks/nps-lookup?code=${encodeURIComponent(q)}`).catch(() => null);
    setBusy(null);
    if (!res?.ok) { setError((await readError(res, 'NPS lookup failed')).error); return; }
    setForm(fromUnit((await res.json()).unit));
  };

  const loadCandidates = async () => {
    setBusy('candidates'); setError(null);
    const res = await fetch('/api/admin/parks/nps-lookup').catch(() => null);
    setBusy(null);
    if (!res?.ok) { setError((await readError(res, 'NPS lookup failed')).error); return; }
    setCandidates((await res.json()).candidates ?? []);
  };

  const save = async () => {
    if (!form) return;
    setBusy('save'); setError(null);
    const res = await fetch('/api/admin/parks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, ...acks }),
    }).catch(() => null);
    setBusy(null);
    if (!res?.ok) { setError((await readError(res, 'Failed to add park')).error); return; }
    setSavedCode(form.park_code);
    setForm(null);
    setCode('');
    reset();
    setCandidates(prev => prev?.filter(c => c.park_code !== form.park_code) ?? prev);
    announceParkChange();
    router.refresh(); // table + Edit park list
  };

  return (
    <CollapsibleCard
      id="add-park"
      title="Add park"
      defaultOpen={false}
      subtitle="For a newly established NPS unit. Look it up by park code to prefill from NPS, or fill it in by hand if NPS doesn't list it yet."
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <input
            className={`${fieldClass} max-w-[180px]`}
            placeholder="Park code, e.g. chir"
            value={code}
            onChange={e => setCode(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') lookup(code); }}
          />
          <button type="button" className={btnSecondary} disabled={!code.trim() || busy !== null} onClick={() => lookup(code)}>
            <Search className="h-4 w-4" /> {busy === 'lookup' ? 'Looking up…' : 'Look up on NPS'}
          </button>
          <button type="button" className={btnSecondary} disabled={busy !== null} onClick={() => { setError(null); setSavedCode(null); setForm({ ...EMPTY, park_code: code.trim().toLowerCase() }); }}>
            Fill in by hand
          </button>
          <button type="button" className={btnSecondary} disabled={busy !== null} onClick={loadCandidates}>
            <Download className="h-4 w-4" /> {busy === 'candidates' ? 'Checking NPS…' : 'NPS units not in ParkQuest'}
          </button>
        </div>

        {candidates && (
          candidates.length === 0 ? (
            <p className="text-sm text-ink-mute">Every NPS unit with a tracked designation is already in ParkQuest.</p>
          ) : (
            <div className="divide-y divide-hairline-soft rounded-lg border border-hairline">
              {candidates.map(c => (
                <div key={c.park_code} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="font-semibold text-ink">{c.name}</span>
                    <span className="ml-2 text-ink-mute">{c.park_code} · {c.designation} · {c.states}</span>
                  </span>
                  <button type="button" className={btnSecondary} onClick={() => { setCode(c.park_code); setSavedCode(null); setForm(fromUnit(c)); }}>
                    Use
                  </button>
                </div>
              ))}
            </div>
          )
        )}

        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        {savedCode && <SavedNote code={savedCode} verb="Park added" />}

        {form && (
          <>
            <ParkFields form={form} set={set} codeLocked={false} />
            {preview.invalid && <p className="text-sm text-red-700">Can&apos;t add yet: {preview.invalid}</p>}
            {preview.guards && <GuardChecklist parkCode={form.park_code} guards={preview.guards} acks={acks} update={update} />}
            <div className="flex gap-2">
              <button type="button" className={btnPrimary} disabled={busy !== null || !canWrite(form.park_code, preview, acks)} onClick={save}>
                {busy === 'save' ? 'Adding…' : preview.pending ? 'Checking…' : 'Add park'}
              </button>
              <button type="button" className={btnSecondary} disabled={busy !== null} onClick={() => { setForm(null); setError(null); reset(); }}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </CollapsibleCard>
  );
}

// ─── Edit park ────────────────────────────────────────────────────────────────

interface ParkOption { park_code: string; name: string; designation: string | null; is_national_park: boolean }

const DESIGNATION_SUFFIX = /\s+National (Monument|Historical Park|Historic Site|Preserve|Recreation Area|Seashore|Memorial|Park)$/;

export function EditParkPanel({ parks, initialCode }: { parks: ParkOption[]; initialCode?: string }) {
  const router = useRouter();
  const tick = useParkChangeTick();
  const [selected, setSelected] = useState(initialCode ?? '');
  const [reloadKey, setReloadKey] = useState(0);
  const [saved, setSaved] = useState<FormState | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState<'nps' | 'save' | null>(null);
  const [error, setError] = useState<{ error: string; code?: string } | null>(null);
  const [savedCode, setSavedCode] = useState<string | null>(null);
  const loading = !!selected && saved?.park_code !== selected && !error;
  const dirty = !!form && !!saved && JSON.stringify(form) !== JSON.stringify(saved);
  const preview = usePreview('edit', form ?? EMPTY, dirty, tick);
  const { acks, update, reset } = useAcks(preview.guards);

  const set = (patch: Partial<FormState>) => setForm(f => (f ? { ...f, ...patch } : f));

  const pick = (code: string) => {
    setSelected(code);
    setForm(null); setSaved(null); setError(null); setSavedCode(null); reset();
  };

  const reload = () => {
    setSaved(null); setForm(null); setError(null); reset();
    setReloadKey(k => k + 1);
  };

  // Another panel (e.g. a revert in the change log) wrote a park: pick up the
  // new stored values as the base, unless there are unsaved edits to keep.
  const [seenTick, setSeenTick] = useState(tick);
  if (tick !== seenTick) {
    setSeenTick(tick);
    if (!dirty && selected) { setSaved(null); setForm(null); setReloadKey(k => k + 1); }
  }

  useEffect(() => {
    if (!selected) return;
    let alive = true;
    fetch(`/api/admin/parks/${selected}`)
      .then(async res => {
        if (!alive) return;
        if (!res.ok) { setError(await readError(res, 'Failed to load park')); return; }
        const { park } = await res.json();
        const loaded = fromPark(park.park_code, park);
        setSaved(loaded);
        setForm(loaded);
      })
      .catch(() => { if (alive) setError({ error: 'Failed to load park' }); });
    return () => { alive = false; };
  }, [selected, reloadKey]);

  // Monument (or any designation) → National Park, the Chiricahua case:
  // NPS keeps the park code, so this is a rename + flag flip on the same row.
  const promote = () => {
    if (!form) return;
    set({
      name: DESIGNATION_SUFFIX.test(form.name) ? form.name.replace(DESIGNATION_SUFFIX, ' National Park') : form.name,
      designation: 'National Park',
      is_national_park: true,
    });
  };

  const pullFromNps = async () => {
    if (!form) return;
    setBusy('nps'); setError(null);
    const res = await fetch(`/api/admin/parks/nps-lookup?code=${form.park_code}`).catch(() => null);
    setBusy(null);
    if (!res?.ok) { setError(await readError(res, 'NPS lookup failed')); return; }
    const unit: NpsUnit = (await res.json()).unit;
    const nps = fromUnit(unit);
    // Only fill what NPS actually has — never blank out a field we already have.
    set(Object.fromEntries(
      (['name', 'states', 'designation', 'latitude', 'longitude', 'description', 'image_url'] as const)
        .filter(k => nps[k]).map(k => [k, nps[k]]),
    ));
  };

  const save = async () => {
    if (!form || !saved) return;
    setBusy('save'); setError(null); setSavedCode(null);
    const res = await fetch(`/api/admin/parks/${form.park_code}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      // base: the park exactly as loaded — the server refuses the save if it
      // has changed since (another admin, an NPS sync, a revert).
      body: JSON.stringify({ ...form, base: saved, ...acks }),
    }).catch(() => null);
    setBusy(null);
    if (!res?.ok) { setError(await readError(res, 'Failed to save park')); return; }
    const { park } = await res.json();
    const next = fromPark(form.park_code, park);
    setSaved(next);
    setForm(next);
    reset();
    setSavedCode(form.park_code);
    announceParkChange();
    router.refresh();
  };

  const changedList = form && saved
    ? (Object.keys(FIELD_LABELS) as EditableField[]).filter(k => form[k] !== saved[k]).map(k => FIELD_LABELS[k])
    : [];

  return (
    <CollapsibleCard
      id="edit-park"
      title="Edit park"
      defaultOpen={!!initialCode}
      subtitle="Redesignations (a monument becoming a National Park), renames, and metadata fixes. The park code never changes."
    >
      <div className="flex flex-col gap-4">
        <select className={`${fieldClass} sm:max-w-sm`} value={selected} onChange={e => pick(e.target.value)}>
          <option value="">Select a park…</option>
          {parks.map(p => (
            <option key={p.park_code} value={p.park_code}>
              {p.name} ({p.park_code}){p.is_national_park ? ' · NP' : ''}
            </option>
          ))}
        </select>

        {loading && <p className="text-sm text-ink-mute">Loading…</p>}
        {error && (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-red-600">{error.error}</p>
            {error.code === 'conflict' && (
              <button type="button" className={btnSecondary} onClick={reload}>
                <RefreshCw className="h-4 w-4" /> Reload park (drops your edits)
              </button>
            )}
          </div>
        )}
        {savedCode && !dirty && <SavedNote code={savedCode} verb="Saved" />}

        {form && (
          <>
            <div className="flex flex-wrap gap-2">
              {!form.is_national_park && (
                <button type="button" className={btnSecondary} disabled={busy !== null} onClick={promote}>
                  Make it a National Park
                </button>
              )}
              <button type="button" className={btnSecondary} disabled={busy !== null} onClick={pullFromNps}>
                <Download className="h-4 w-4" /> {busy === 'nps' ? 'Pulling…' : 'Fill from NPS'}
              </button>
            </div>
            <ParkFields form={form} set={set} codeLocked />
            {changedList.length > 0 && (
              <p className="text-xs text-ink-mute">Unsaved changes: {changedList.join(', ')}</p>
            )}
            {dirty && preview.invalid && <p className="text-sm text-red-700">Can&apos;t save yet: {preview.invalid}</p>}
            {dirty && preview.guards && <GuardChecklist parkCode={form.park_code} guards={preview.guards} acks={acks} update={update} />}
            <div className="flex gap-2">
              <button type="button" className={btnPrimary} disabled={!dirty || busy !== null || !canWrite(form.park_code, preview, acks)} onClick={save}>
                {busy === 'save' ? 'Saving…' : dirty && preview.pending ? 'Checking…' : 'Save changes'}
              </button>
              <button type="button" className={btnSecondary} disabled={!dirty || busy !== null} onClick={() => { setForm(saved); setError(null); reset(); }}>
                Discard
              </button>
            </div>
            <ParkChangeList parkCode={form.park_code} limit={10} />
          </>
        )}
      </div>
    </CollapsibleCard>
  );
}

// ─── Change log ───────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<ParkChangeEntry['action'], string> = {
  create: 'Added', update: 'Edited', sync: 'NPS sync', revert: 'Reverted',
};

function shown(v: unknown): string {
  if (v === null || v === undefined || v === '') return '(none)';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  const s = String(v);
  return s.length > 90 ? `${s.slice(0, 90)}…` : s;
}

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' });
}

function ChangeRow({ c, showPark }: { c: ParkChangeEntry; showPark: boolean }) {
  const router = useRouter();
  const [plan, setPlan] = useState<ParkGuards | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { acks, update, reset } = useAcks(plan);
  const revertable = c.action !== 'create' && c.reverted_by === null;

  const startRevert = async () => {
    setBusy(true); setError(null);
    const res = await fetch(`/api/admin/parks/changes/${c.id}/revert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dry_run: true }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) { setError((await readError(res, 'Revert check failed')).error); return; }
    setPlan((await res.json()).guards);
  };

  const confirmRevert = async () => {
    setBusy(true); setError(null);
    const res = await fetch(`/api/admin/parks/changes/${c.id}/revert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(acks),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) { setError((await readError(res, 'Revert failed')).error); return; }
    setPlan(null);
    reset();
    announceParkChange();
    router.refresh();
  };

  return (
    <div className="px-3 py-2 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span>
          <span className="font-semibold text-ink">{ACTION_LABELS[c.action]}</span>
          {c.action === 'revert' && c.reverts_change_id && <span className="text-ink-mute"> #{c.reverts_change_id}</span>}
          {showPark && <span className="text-ink"> · {c.park_name ?? c.park_code}</span>}
          <span className="text-ink-mute"> · {when(c.created_at)} · {c.admin_username ? `@${c.admin_username}` : c.admin_clerk_user_id} · #{c.id}</span>
        </span>
        {revertable && !plan && (
          <button type="button" className={`${btnSecondary} px-3 py-1`} disabled={busy} onClick={startRevert}>
            <RotateCcw className="h-3.5 w-3.5" /> {busy ? 'Checking…' : 'Revert'}
          </button>
        )}
        {c.reverted_by !== null && <span className="text-xs text-ink-mute">Reverted by #{c.reverted_by}</span>}
      </div>
      <ul className="mt-1 text-xs text-ink-soft">
        {c.changed_fields.map(f => (
          <li key={f}>
            {FIELD_LABELS[f] ?? f}: {c.before ? <>{shown(c.before[f])} → </> : null}{shown(c.after[f])}
          </li>
        ))}
      </ul>
      {error && <p className="mt-1 text-sm font-medium text-red-600">{error}</p>}
      {plan && (
        <div className="mt-2 flex flex-col gap-2">
          <GuardChecklist parkCode={c.park_code} guards={plan} acks={acks} update={update} />
          <div className="flex gap-2">
            <button type="button" className={btnPrimary} disabled={busy || missingAcks(c.park_code, plan, acks).length > 0} onClick={confirmRevert}>
              {busy ? 'Reverting…' : 'Confirm revert'}
            </button>
            <button type="button" className={btnSecondary} disabled={busy} onClick={() => { setPlan(null); reset(); }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ParkChangeList({ parkCode, limit }: { parkCode?: string; limit: number }) {
  const tick = useParkChangeTick();
  const [result, setResult] = useState<{ key: string; changes: ParkChangeEntry[] | null; error: string | null } | null>(null);
  const key = JSON.stringify([parkCode, limit, tick]);

  useEffect(() => {
    let alive = true;
    const qs = new URLSearchParams({ limit: String(limit), ...(parkCode ? { park_code: parkCode } : {}) });
    fetch(`/api/admin/parks/changes?${qs}`)
      .then(async res => {
        if (!alive) return;
        if (!res.ok) { setResult({ key, changes: null, error: (await readError(res, 'Failed to load change log')).error }); return; }
        setResult({ key, changes: (await res.json()).changes ?? [], error: null });
      })
      .catch(() => { if (alive) setResult({ key, changes: null, error: 'Failed to load change log' }); });
    return () => { alive = false; };
  }, [key, parkCode, limit]);

  const current = result?.key === key ? result : null;
  if (!current) return <p className="text-sm text-ink-mute">Loading change log…</p>;
  if (current.error) return <p className="text-sm font-medium text-red-600">{current.error}</p>;
  if (!current.changes?.length) return <p className="text-sm text-ink-mute">No changes logged{parkCode ? ' for this park' : ''} yet.</p>;

  return (
    <div>
      {parkCode && <p className="mb-1 text-xs font-semibold text-ink-soft">History</p>}
      <div className="divide-y divide-hairline-soft rounded-lg border border-hairline">
        {current.changes.map(c => <ChangeRow key={c.id} c={c} showPark={!parkCode} />)}
      </div>
    </div>
  );
}

export function ParkChangeLogPanel() {
  return (
    <CollapsibleCard
      id="park-changes"
      title="Park change log"
      defaultOpen={false}
      subtitle="Every add, edit, NPS sync apply, and revert, newest first. Revert restores the fields a change touched — refused if they've changed again since. Adding a park can't be reverted."
    >
      <ParkChangeList limit={50} />
    </CollapsibleCard>
  );
}
