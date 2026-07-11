'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { describeCondition, TIER_CONFIG, type BadgeTier } from '@/lib/badges';
import type { BadgeCondition, BadgeConditionType } from '@parkquest/types';

interface CustomBadgeRow {
  id: number;
  badge_id: string;
  name: string;
  description: string;
  emoji: string;
  tier: BadgeTier;
  conditions: BadgeCondition[];
  enabled: boolean;
  earned_count: number;
}

interface ParkOption { park_code: string; name: string }

const fieldClass =
  'w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-mute focus:outline-none focus:ring-2 focus:ring-primary/40';

const btnBase =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50';

const TIERS: BadgeTier[] = ['bronze', 'silver', 'gold', 'platinum', 'legendary'];

const CONDITION_LABELS: Record<BadgeConditionType, string> = {
  parks_visited:         'Parks visited',
  states_visited:        'States visited',
  bucket_list_count:     'Bucket list size',
  total_visits:          'Total trips logged',
  visits_to_single_park: 'Trips to one park',
  parks_in_year:         'Parks in one year',
  visits_in_year:        'Trips in one year',
  specific_parks:        'Specific parks',
};

const EMPTY_FORM = {
  name: '',
  description: '',
  emoji: '',
  tier: 'bronze' as BadgeTier,
  enabled: true,
  conditions: [{ type: 'parks_visited', count: 1 }] as BadgeCondition[],
};

type FormState = typeof EMPTY_FORM;

// ── Condition row editor ────────────────────────────────────────────────────────

function ConditionEditor({
  condition, parks, onChange, onRemove, removable,
}: {
  condition: BadgeCondition;
  parks: ParkOption[];
  onChange: (c: BadgeCondition) => void;
  onRemove: () => void;
  removable: boolean;
}) {
  const [parkSearch, setParkSearch] = useState('');
  const isParks = condition.type === 'specific_parks';
  const selected = useMemo(() => condition.parkCodes ?? [], [condition.parkCodes]);

  const matches = useMemo(() => {
    const q = parkSearch.trim().toLowerCase();
    if (!q) return [];
    return parks
      .filter(p => !selected.includes(p.park_code) && p.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [parkSearch, parks, selected]);

  const setType = (type: BadgeConditionType) => {
    onChange(type === 'specific_parks'
      ? { type, parkCodes: [], mode: 'all' }
      : { type, count: condition.count && condition.count > 0 ? condition.count : 1 });
  };

  return (
    <div className="rounded-lg border border-hairline bg-surface-alt/50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          className={`${fieldClass} w-auto`}
          value={condition.type}
          onChange={e => setType(e.target.value as BadgeConditionType)}
        >
          {(Object.keys(CONDITION_LABELS) as BadgeConditionType[]).map(t => (
            <option key={t} value={t}>{CONDITION_LABELS[t]}</option>
          ))}
        </select>

        {isParks ? (
          <>
            <select
              className={`${fieldClass} w-auto`}
              value={condition.mode ?? 'all'}
              onChange={e => {
                const mode = e.target.value as 'all' | 'any';
                onChange({ ...condition, mode, count: mode === 'any' ? Math.min(condition.count ?? 1, Math.max(selected.length, 1)) : undefined });
              }}
            >
              <option value="all">all of the parks</option>
              <option value="any">any N of the parks</option>
            </select>
            {condition.mode === 'any' && (
              <input
                type="number" min={1} max={Math.max(selected.length, 1)}
                className={`${fieldClass} w-20`}
                value={condition.count ?? 1}
                onChange={e => onChange({ ...condition, count: Number(e.target.value) })}
              />
            )}
          </>
        ) : (
          <>
            <span className="text-sm text-ink-mute">at least</span>
            <input
              type="number" min={1}
              className={`${fieldClass} w-24`}
              value={condition.count ?? 1}
              onChange={e => onChange({ ...condition, count: Number(e.target.value) })}
            />
          </>
        )}

        {removable && (
          <button type="button" onClick={onRemove} className="ml-auto rounded p-1 text-ink-mute hover:text-ink" aria-label="Remove condition">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {isParks && (
        <div className="mt-2">
          {selected.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {selected.map(code => {
                const park = parks.find(p => p.park_code === code);
                return (
                  <span key={code} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                    {park?.name ?? code.toUpperCase()}
                    <button
                      type="button"
                      onClick={() => onChange({ ...condition, parkCodes: selected.filter(c => c !== code) })}
                      aria-label={`Remove ${park?.name ?? code}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
          <input
            className={fieldClass}
            placeholder="Search parks to add…"
            value={parkSearch}
            onChange={e => setParkSearch(e.target.value)}
          />
          {matches.length > 0 && (
            <div className="mt-1 overflow-hidden rounded-lg border border-hairline bg-surface">
              {matches.map(p => (
                <button
                  key={p.park_code}
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-surface-alt"
                  onClick={() => {
                    onChange({ ...condition, parkCodes: [...selected, p.park_code] });
                    setParkSearch('');
                  }}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Manager ─────────────────────────────────────────────────────────────────────

export default function CustomBadgeManager() {
  const [badges, setBadges] = useState<CustomBadgeRow[] | null>(null);
  const [parks, setParks] = useState<ParkOption[]>([]);
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parkNames = useMemo(() => new Map(parks.map(p => [p.park_code, p.name])), [parks]);

  const load = () => {
    fetch('/api/admin/custom-badges').then(r => r.json()).then(d => setBadges(d.badges ?? []));
  };

  useEffect(() => {
    load();
    fetch('/api/admin/parks?sort=name&dir=asc').then(r => r.json()).then(d => setParks(d.parks ?? []));
  }, []);

  const openNew = () => { setForm(EMPTY_FORM); setEditingId('new'); setError(null); };
  const openEdit = (b: CustomBadgeRow) => {
    setForm({ name: b.name, description: b.description, emoji: b.emoji, tier: b.tier, enabled: b.enabled, conditions: b.conditions });
    setEditingId(b.id);
    setError(null);
  };
  const close = () => { setEditingId(null); setError(null); };

  const save = async () => {
    setSaving(true);
    setError(null);
    const res = await fetch(
      editingId === 'new' ? '/api/admin/custom-badges' : `/api/admin/custom-badges/${editingId}`,
      {
        method: editingId === 'new' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      },
    ).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const body = await res?.json().catch(() => null);
      setError(body?.error ?? 'Failed to save badge');
      return;
    }
    close();
    load();
  };

  const remove = async (b: CustomBadgeRow) => {
    const ok = window.confirm(
      `Delete "${b.name}"? This removes it from the ${b.earned_count} user${b.earned_count === 1 ? '' : 's'} who earned it and deletes their share posts.`,
    );
    if (!ok) return;
    await fetch(`/api/admin/custom-badges/${b.id}`, { method: 'DELETE' }).catch(() => null);
    load();
  };

  const updateCondition = (i: number, c: BadgeCondition) =>
    setForm(f => ({ ...f, conditions: f.conditions.map((old, idx) => (idx === i ? c : old)) }));

  return (
    <Card className="border-hairline p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-ink">Custom badges</h2>
          <p className="mt-0.5 text-sm text-ink-mute">
            Admin-defined badges. Users earn them automatically once every condition is met.
          </p>
        </div>
        <button type="button" onClick={openNew} className={`${btnBase} border-primary bg-primary text-white hover:opacity-90`}>
          <Plus className="h-4 w-4" /> New badge
        </button>
      </div>

      {/* List */}
      <div className="mt-4 flex flex-col gap-2">
        {badges === null && <p className="text-sm text-ink-mute">Loading…</p>}
        {badges?.length === 0 && <p className="text-sm text-ink-mute">No custom badges yet.</p>}
        {badges?.map(b => (
          <div key={b.id} className="flex items-start gap-3 rounded-lg border border-hairline p-3">
            <span className="text-2xl leading-none">{b.emoji}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-ink">{b.name}</span>
                <span className={`text-xs font-semibold ${TIER_CONFIG[b.tier].labelColor}`}>{TIER_CONFIG[b.tier].label}</span>
                {!b.enabled && (
                  <span className="rounded-full bg-surface-alt px-2 py-0.5 text-xs font-medium text-ink-mute">Disabled</span>
                )}
                <span className="text-xs text-ink-mute">{b.earned_count} earned</span>
              </div>
              <p className="mt-0.5 truncate text-sm text-ink-soft">{b.description}</p>
              <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                {b.conditions.map((c, i) => (
                  <li key={i} className="text-xs text-ink-mute">• {describeCondition(c, parkNames)}</li>
                ))}
              </ul>
            </div>
            <div className="flex shrink-0 gap-1">
              <button type="button" onClick={() => openEdit(b)} className="rounded p-1.5 text-ink-mute hover:text-ink" aria-label={`Edit ${b.name}`}>
                <Pencil className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => remove(b)} className="rounded p-1.5 text-ink-mute hover:text-red-600" aria-label={`Delete ${b.name}`}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Editor */}
      {editingId !== null && (
        <div className="mt-4 rounded-xl border border-primary/40 bg-surface p-4">
          <h3 className="font-semibold text-ink">{editingId === 'new' ? 'New badge' : 'Edit badge'}</h3>

          <div className="mt-3 grid gap-3 sm:grid-cols-[80px_1fr_140px]">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-mute">Emoji</label>
              <input
                className={`${fieldClass} text-center text-lg`}
                value={form.emoji}
                onChange={e => setForm(f => ({ ...f, emoji: e.target.value }))}
                placeholder="🏅"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-mute">Name</label>
              <input
                className={fieldClass}
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Weekend Warrior"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-mute">Tier</label>
              <select
                className={fieldClass}
                value={form.tier}
                onChange={e => setForm(f => ({ ...f, tier: e.target.value as BadgeTier }))}
              >
                {TIERS.map(t => <option key={t} value={t}>{TIER_CONFIG[t].label}</option>)}
              </select>
            </div>
          </div>

          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-ink-mute">Description (shown to users)</label>
            <input
              className={fieldClass}
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Logged 10 trips in a single year"
            />
          </div>

          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-medium text-ink-mute">Conditions (user must meet all of them)</label>
              <button
                type="button"
                className="text-xs font-semibold text-primary hover:underline"
                onClick={() => setForm(f => ({ ...f, conditions: [...f.conditions, { type: 'parks_visited', count: 1 }] }))}
              >
                + Add condition
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {form.conditions.map((c, i) => (
                <ConditionEditor
                  key={i}
                  condition={c}
                  parks={parks}
                  onChange={next => updateCondition(i, next)}
                  onRemove={() => setForm(f => ({ ...f, conditions: f.conditions.filter((_, idx) => idx !== i) }))}
                  removable={form.conditions.length > 1}
                />
              ))}
            </div>
          </div>

          <label className="mt-3 flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))}
            />
            Enabled (evaluated and shown to users)
          </label>

          {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}

          <div className="mt-4 flex gap-2">
            <button type="button" onClick={save} disabled={saving} className={`${btnBase} border-primary bg-primary text-white hover:opacity-90`}>
              {saving ? 'Saving…' : editingId === 'new' ? 'Create badge' : 'Save changes'}
            </button>
            <button type="button" onClick={close} className={`${btnBase} border-hairline bg-surface text-ink hover:bg-surface-alt`}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
