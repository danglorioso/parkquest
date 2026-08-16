'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { BadgeColors, BadgeCondition, BadgeConditionType, BadgeParkScope, BadgeTier } from '@parkquest/types';

export const fieldClass =
  'w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-mute focus:outline-none focus:ring-2 focus:ring-primary/40';

export const btnBase =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50';

export const TIERS: BadgeTier[] = ['bronze', 'silver', 'gold', 'platinum', 'legendary'];

/** Same fill/light pairs the clients fall back to when a badge has no custom colors. */
export const TIER_FILL_LIGHT: Record<BadgeTier, BadgeColors> = {
  bronze:    { fill: '#B27339', light: '#D4A070' },
  silver:    { fill: '#A8A39B', light: '#C5C0B8' },
  gold:      { fill: '#D4A93F', light: '#EBC96A' },
  platinum:  { fill: '#6E97A3', light: '#95B8C2' },
  legendary: { fill: '#8B5DBF', light: '#B08ADE' },
};

export const CONDITION_LABELS: Record<BadgeConditionType, string> = {
  parks_visited:         'Parks visited',
  all_parks_visited:     'Every park visited',
  states_visited:        'States visited',
  bucket_list_count:     'Bucket list size',
  total_visits:          'Total trips logged',
  visits_to_single_park: 'Trips to one park',
  parks_in_year:         'Parks in one year',
  visits_in_year:        'Trips in one year',
  specific_parks:        'Specific parks',
};

export interface ParkOption { park_code: string; name: string }

// 'national_park' is the curated 63 — NOT "any area the NPS operates".
// That's what 'all' is for, named that way specifically so it can't be
// mistaken for "all National Parks" in this dropdown.
export const SCOPE_LABELS: Record<BadgeParkScope, string> = {
  national_park: 'National Parks',
  historic_park: 'National Historical Parks',
  all: 'any park area',
};

export function badgeGradient(colors: BadgeColors | null, tier: BadgeTier): string {
  const c = colors ?? TIER_FILL_LIGHT[tier] ?? TIER_FILL_LIGHT.bronze;
  return `linear-gradient(140deg, ${c.light} 0%, ${c.fill} 100%)`;
}

// ── Colors editor ───────────────────────────────────────────────────────────────
// null = follow the tier palette; a pair = badge-specific colors everywhere.

export function ColorsEditor({
  tier, colors, emoji, onChange,
}: {
  tier: BadgeTier;
  colors: BadgeColors | null;
  emoji: string;
  onChange: (c: BadgeColors | null) => void;
}) {
  const custom = colors !== null;
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-ink-mute">Colors</label>
      <div className="flex flex-wrap items-center gap-3">
        <span
          className="flex h-10 w-10 items-center justify-center rounded-full text-lg"
          style={{ background: badgeGradient(colors, tier) }}
          aria-hidden
        >
          {emoji || '🏅'}
        </span>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={custom}
            onChange={e => onChange(e.target.checked ? { ...TIER_FILL_LIGHT[tier] } : null)}
          />
          Custom colors (otherwise follows the tier)
        </label>
        {custom && (
          <>
            <label className="flex items-center gap-1.5 text-xs text-ink-mute">
              Main
              <input
                type="color"
                value={colors.fill}
                onChange={e => onChange({ ...colors, fill: e.target.value })}
                className="h-8 w-10 cursor-pointer rounded border border-hairline bg-surface"
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-ink-mute">
              Light
              <input
                type="color"
                value={colors.light}
                onChange={e => onChange({ ...colors, light: e.target.value })}
                className="h-8 w-10 cursor-pointer rounded border border-hairline bg-surface"
              />
            </label>
          </>
        )}
      </div>
    </div>
  );
}

// ── Condition row editor ────────────────────────────────────────────────────────

function ScopeSelect({ condition, onChange }: { condition: BadgeCondition; onChange: (c: BadgeCondition) => void }) {
  return (
    <select
      className={`${fieldClass} w-auto`}
      value={condition.scope ?? 'national_park'}
      onChange={e => onChange({ ...condition, scope: e.target.value as BadgeParkScope })}
    >
      {(Object.keys(SCOPE_LABELS) as BadgeParkScope[]).map(s => (
        <option key={s} value={s}>{SCOPE_LABELS[s]}</option>
      ))}
    </select>
  );
}

export function ConditionEditor({
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
  const isAllParks = condition.type === 'all_parks_visited';
  const selected = useMemo(() => condition.parkCodes ?? [], [condition.parkCodes]);

  const matches = useMemo(() => {
    const q = parkSearch.trim().toLowerCase();
    if (!q) return [];
    return parks
      .filter(p => !selected.includes(p.park_code) && p.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [parkSearch, parks, selected]);

  const setType = (type: BadgeConditionType) => {
    if (type === 'specific_parks') onChange({ type, parkCodes: [], mode: 'all' });
    else if (type === 'all_parks_visited') onChange({ type });
    else onChange({ type, count: condition.count && condition.count > 0 ? condition.count : 1 });
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
        ) : isAllParks ? (
          <ScopeSelect condition={condition} onChange={onChange} />
        ) : condition.type === 'parks_visited' ? (
          <>
            <span className="text-sm text-ink-mute">at least</span>
            <input
              type="number" min={1}
              className={`${fieldClass} w-24`}
              value={condition.count ?? 1}
              onChange={e => onChange({ ...condition, count: Number(e.target.value) })}
            />
            <ScopeSelect condition={condition} onChange={onChange} />
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

// ── Shared display fields (emoji / name / tier / description / colors) ─────────

export interface BadgeDisplayForm {
  name: string;
  description: string;
  emoji: string;
  tier: BadgeTier;
  colors: BadgeColors | null;
}

export function DisplayFieldsEditor({
  form, tierLabels, onChange,
}: {
  form: BadgeDisplayForm;
  tierLabels: Record<BadgeTier, string>;
  onChange: (patch: Partial<BadgeDisplayForm>) => void;
}) {
  return (
    <>
      <div className="mt-3 grid gap-3 sm:grid-cols-[80px_1fr_140px]">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-mute">Emoji</label>
          <input
            className={`${fieldClass} text-center text-lg`}
            value={form.emoji}
            onChange={e => onChange({ emoji: e.target.value })}
            placeholder="🏅"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-mute">Name</label>
          <input
            className={fieldClass}
            value={form.name}
            onChange={e => onChange({ name: e.target.value })}
            placeholder="Weekend Warrior"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-mute">Tier</label>
          <select
            className={fieldClass}
            value={form.tier}
            onChange={e => onChange({ tier: e.target.value as BadgeTier })}
          >
            {TIERS.map(t => <option key={t} value={t}>{tierLabels[t]}</option>)}
          </select>
        </div>
      </div>

      <div className="mt-3">
        <ColorsEditor
          tier={form.tier}
          colors={form.colors}
          emoji={form.emoji}
          onChange={colors => onChange({ colors })}
        />
      </div>

      <div className="mt-3">
        <label className="mb-1 block text-xs font-medium text-ink-mute">Description (shown to users)</label>
        <input
          className={fieldClass}
          value={form.description}
          onChange={e => onChange({ description: e.target.value })}
          placeholder="Logged 10 trips in a single year"
        />
      </div>
    </>
  );
}
