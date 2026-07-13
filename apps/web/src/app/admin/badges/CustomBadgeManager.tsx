'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { describeCondition, TIER_CONFIG, type BadgeTier } from '@/lib/badges';
import type { BadgeColors, BadgeCondition } from '@parkquest/types';
import {
  btnBase, badgeGradient, ConditionEditor, DisplayFieldsEditor, type ParkOption,
} from './editorShared';

interface CustomBadgeRow {
  id: number;
  badge_id: string;
  name: string;
  description: string;
  emoji: string;
  tier: BadgeTier;
  colors: BadgeColors | null;
  conditions: BadgeCondition[];
  enabled: boolean;
  earned_count: number;
}

const EMPTY_FORM = {
  name: '',
  description: '',
  emoji: '',
  tier: 'bronze' as BadgeTier,
  colors: null as BadgeColors | null,
  enabled: true,
  conditions: [{ type: 'parks_visited', count: 1 }] as BadgeCondition[],
};

type FormState = typeof EMPTY_FORM;

const TIER_LABELS = Object.fromEntries(
  Object.entries(TIER_CONFIG).map(([t, c]) => [t, c.label]),
) as Record<BadgeTier, string>;

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
    setForm({
      name: b.name, description: b.description, emoji: b.emoji, tier: b.tier,
      colors: b.colors ?? null, enabled: b.enabled, conditions: b.conditions,
    });
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
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl leading-none"
              style={{ background: badgeGradient(b.colors ?? null, b.tier) }}
            >
              {b.emoji}
            </span>
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

          <DisplayFieldsEditor
            form={form}
            tierLabels={TIER_LABELS}
            onChange={patch => setForm(f => ({ ...f, ...patch }))}
          />

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
