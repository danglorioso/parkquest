'use client';

import { useEffect, useMemo, useState } from 'react';
import { Pencil, RotateCcw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { describeCondition, TIER_CONFIG, type BadgeTier } from '@/lib/badges';
import type { BadgeColors, BadgeCondition } from '@parkquest/types';
import {
  btnBase, badgeGradient, ConditionEditor, DisplayFieldsEditor, type ParkOption,
} from './editorShared';

interface BuiltinBadgeRow {
  badge_id: string;
  name: string;
  description: string;
  emoji: string;
  tier: BadgeTier;
  colors: BadgeColors | null;
  /** Active criteria override; null = code-defined rule. */
  conditions: BadgeCondition[] | null;
  overridden: boolean;
  default_name: string;
  default_description: string;
  default_emoji: string;
  default_tier: BadgeTier;
  /** Prefill for the criteria editor; null when the code rule isn't expressible. */
  builtin_conditions: BadgeCondition[] | null;
  earned_count: number;
}

interface FormState {
  name: string;
  description: string;
  emoji: string;
  tier: BadgeTier;
  colors: BadgeColors | null;
  customCriteria: boolean;
  conditions: BadgeCondition[];
}

const TIER_LABELS = Object.fromEntries(
  Object.entries(TIER_CONFIG).map(([t, c]) => [t, c.label]),
) as Record<BadgeTier, string>;

export default function BuiltinBadgeManager() {
  const [badges, setBadges] = useState<BuiltinBadgeRow[] | null>(null);
  const [parks, setParks] = useState<ParkOption[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parkNames = useMemo(() => new Map(parks.map(p => [p.park_code, p.name])), [parks]);

  const load = () => {
    fetch('/api/admin/builtin-badges').then(r => r.json()).then(d => setBadges(d.badges ?? []));
  };

  useEffect(() => {
    load();
    fetch('/api/admin/parks?sort=name&dir=asc').then(r => r.json()).then(d => setParks(d.parks ?? []));
  }, []);

  const openEdit = (b: BuiltinBadgeRow) => {
    setForm({
      name: b.name,
      description: b.description,
      emoji: b.emoji,
      tier: b.tier,
      colors: b.colors,
      customCriteria: b.conditions !== null,
      conditions: b.conditions ?? b.builtin_conditions ?? [{ type: 'parks_visited', count: 1 }],
    });
    setEditingId(b.badge_id);
    setError(null);
  };
  const close = () => { setEditingId(null); setForm(null); setError(null); };

  const save = async () => {
    if (!form || !editingId) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/admin/builtin-badges/${editingId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        description: form.description,
        emoji: form.emoji,
        tier: form.tier,
        colors: form.colors,
        conditions: form.customCriteria ? form.conditions : null,
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const body = await res?.json().catch(() => null);
      setError(body?.error ?? 'Failed to save badge');
      return;
    }
    close();
    load();
  };

  const reset = async (b: BuiltinBadgeRow) => {
    const ok = window.confirm(
      `Reset "${b.name}" to its default definition ("${b.default_name}")? Users keep the badge; it's re-checked against the default criteria on their next visit.`,
    );
    if (!ok) return;
    await fetch(`/api/admin/builtin-badges/${b.badge_id}`, { method: 'DELETE' }).catch(() => null);
    if (editingId === b.badge_id) close();
    load();
  };

  const editing = editingId !== null ? badges?.find(b => b.badge_id === editingId) : undefined;

  return (
    <Card className="border-hairline p-5 shadow-[var(--shadow-card)]">
      <div>
        <h2 className="text-lg font-bold text-ink">Built-in badges</h2>
        <p className="mt-0.5 text-sm text-ink-mute">
          The standard badge set. Edit any badge&apos;s name, description, emoji, tier, colors,
          or earning criteria — changes apply everywhere and are re-evaluated per user
          (edits can award or revoke). Reset restores the default.
        </p>
      </div>

      {/* List */}
      <div className="mt-4 flex flex-col gap-2">
        {badges === null && <p className="text-sm text-ink-mute">Loading…</p>}
        {badges?.map(b => (
          <div key={b.badge_id} className="flex items-start gap-3 rounded-lg border border-hairline p-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl leading-none"
              style={{ background: badgeGradient(b.colors, b.tier) }}
            >
              {b.emoji}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-ink">{b.name}</span>
                <span className={`text-xs font-semibold ${TIER_CONFIG[b.tier].labelColor}`}>{TIER_CONFIG[b.tier].label}</span>
                {b.overridden && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Edited</span>
                )}
                <span className="text-xs text-ink-mute">{b.earned_count} earned</span>
              </div>
              <p className="mt-0.5 truncate text-sm text-ink-soft">{b.description}</p>
              <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                {b.conditions ? (
                  b.conditions.map((c, i) => (
                    <li key={i} className="text-xs text-ink-mute">• {describeCondition(c, parkNames)} (custom rule)</li>
                  ))
                ) : (
                  <li className="text-xs text-ink-mute">• Built-in rule: {b.default_description}</li>
                )}
              </ul>
            </div>
            <div className="flex shrink-0 gap-1">
              <button type="button" onClick={() => openEdit(b)} className="rounded p-1.5 text-ink-mute hover:text-ink" aria-label={`Edit ${b.name}`}>
                <Pencil className="h-4 w-4" />
              </button>
              {b.overridden && (
                <button type="button" onClick={() => reset(b)} className="rounded p-1.5 text-ink-mute hover:text-ink" aria-label={`Reset ${b.name} to default`}>
                  <RotateCcw className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Editor */}
      {form && editing && (
        <div className="mt-4 rounded-xl border border-primary/40 bg-surface p-4">
          <h3 className="font-semibold text-ink">
            Edit built-in badge
            <span className="ml-2 text-sm font-normal text-ink-mute">
              default: {editing.default_emoji} {editing.default_name}
            </span>
          </h3>

          <DisplayFieldsEditor
            form={form}
            tierLabels={TIER_LABELS}
            onChange={patch => setForm(f => (f ? { ...f, ...patch } : f))}
          />

          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-ink-mute">Earning criteria</label>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="radio"
                  name={`criteria-${editing.badge_id}`}
                  checked={!form.customCriteria}
                  onChange={() => setForm(f => (f ? { ...f, customCriteria: false } : f))}
                />
                Built-in rule: {editing.default_description}
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="radio"
                  name={`criteria-${editing.badge_id}`}
                  checked={form.customCriteria}
                  onChange={() => setForm(f => (f ? { ...f, customCriteria: true } : f))}
                />
                Custom conditions (user must meet all of them)
              </label>
            </div>

            {form.customCriteria && (
              <div className="mt-2">
                <div className="mb-1 flex justify-end">
                  <button
                    type="button"
                    className="text-xs font-semibold text-primary hover:underline"
                    onClick={() => setForm(f => (f ? { ...f, conditions: [...f.conditions, { type: 'parks_visited', count: 1 }] } : f))}
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
                      onChange={next => setForm(f => (f ? { ...f, conditions: f.conditions.map((old, idx) => (idx === i ? next : old)) } : f))}
                      onRemove={() => setForm(f => (f ? { ...f, conditions: f.conditions.filter((_, idx) => idx !== i) } : f))}
                      removable={form.conditions.length > 1}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}

          <div className="mt-4 flex gap-2">
            <button type="button" onClick={save} disabled={saving} className={`${btnBase} border-primary bg-primary text-white hover:opacity-90`}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button type="button" onClick={close} className={`${btnBase} border-hairline bg-surface text-ink hover:bg-surface-alt`}>
              Cancel
            </button>
            {editing.overridden && (
              <button type="button" onClick={() => reset(editing)} className={`${btnBase} ml-auto border-hairline bg-surface text-ink hover:bg-surface-alt`}>
                <RotateCcw className="h-4 w-4" /> Reset to default
              </button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
