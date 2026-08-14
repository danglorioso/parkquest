'use client';

import { useState } from 'react';
import { RefreshCw, Check } from 'lucide-react';
import { CollapsibleCard } from '../CollapsibleCard';
import type { Change } from '@/app/api/admin/parks/sync/route';

const btnBase =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50';

const FIELD_LABELS: Record<Change['field'], string> = {
  name: 'Name', states: 'States', description: 'Description',
  latitude: 'Latitude', longitude: 'Longitude', image_url: 'Image URL',
};

const TRUNCATE_AT = 140;

function changeKey(c: Change) {
  return `${c.park_code}:${c.field}`;
}

export default function SyncParksPanel() {
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ applied: number; skipped: string[] } | null>(null);

  const check = async () => {
    setChecking(true);
    setError(null);
    setResult(null);
    const res = await fetch('/api/admin/parks/sync').catch(() => null);
    setChecking(false);
    if (!res?.ok) {
      const body = await res?.json().catch(() => null);
      setError(body?.error ?? 'Failed to check for updates');
      setChanges(null);
      return;
    }
    const body = await res.json();
    const found: Change[] = body.changes ?? [];
    setChanges(found);
    setSelected(new Set(found.map(changeKey)));
  };

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleExpanded = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const apply = async () => {
    if (!changes) return;
    const toApply = changes.filter((c) => selected.has(changeKey(c)));
    if (toApply.length === 0) return;
    setApplying(true);
    setError(null);
    const res = await fetch('/api/admin/parks/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes: toApply }),
    }).catch(() => null);
    setApplying(false);
    if (!res?.ok) {
      const body = await res?.json().catch(() => null);
      setError(body?.error ?? 'Failed to apply changes');
      return;
    }
    const body = await res.json();
    setResult(body);
    setChanges(null);
    setSelected(new Set());
  };

  return (
    <CollapsibleCard
      title="Sync from NPS"
      subtitle="Review NPS changes before applying them."
      headerRight={
        <button type="button" onClick={check} disabled={checking} className={`${btnBase} shrink-0 border-hairline bg-surface text-ink hover:bg-surface-alt`}>
          <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
          {checking ? 'Checking…' : 'Check for updates'}
        </button>
      }
    >
      {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}

      {result && (
        <div className="mt-3 rounded-lg border border-hairline bg-surface p-3 text-sm text-ink">
          <p className="font-semibold">Applied {result.applied} change{result.applied === 1 ? '' : 's'}.</p>
          {result.skipped.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-ink-mute">
              {result.skipped.map((s) => <li key={s}>{s}</li>)}
            </ul>
          )}
        </div>
      )}

      {changes && changes.length === 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-ink-mute"><Check className="h-4 w-4" /> Everything is up to date.</p>
      )}

      {changes && changes.length > 0 && (
        <>
          <div className="mt-4 divide-y divide-hairline-soft rounded-lg border border-hairline">
            {changes.map((c) => {
              const key = changeKey(c);
              const oldText = c.old_value ?? '(none)';
              const newText = c.new_value;
              const isLong = oldText.length > TRUNCATE_AT || newText.length > TRUNCATE_AT;
              const isExpanded = expanded.has(key);
              const shownOld = isLong && !isExpanded ? `${oldText.slice(0, TRUNCATE_AT)}…` : oldText;
              const shownNew = isLong && !isExpanded ? `${newText.slice(0, TRUNCATE_AT)}…` : newText;

              return (
                <div key={key} className="p-3">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input type="checkbox" checked={selected.has(key)} onChange={() => toggle(key)} />
                    <span className="font-semibold text-ink">{c.park_name}</span>
                    <span className="text-xs font-bold uppercase tracking-wide text-ink-mute">{FIELD_LABELS[c.field]}</span>
                  </label>

                  <div className="mt-2 ml-6 overflow-hidden rounded-md border border-hairline font-mono text-xs">
                    <div className="flex items-start gap-2 bg-red-50 px-2 py-1.5 text-red-700">
                      <span className="select-none font-bold">−</span>
                      <span className="whitespace-pre-wrap break-words">{shownOld}</span>
                    </div>
                    <div className="flex items-start gap-2 bg-green-50 px-2 py-1.5 text-green-700">
                      <span className="select-none font-bold">+</span>
                      <span className="whitespace-pre-wrap break-words">{shownNew}</span>
                    </div>
                  </div>

                  {isLong && (
                    <button
                      type="button"
                      onClick={() => toggleExpanded(key)}
                      className="mt-1 ml-6 text-xs font-semibold text-primary hover:underline"
                    >
                      {isExpanded ? 'Show less' : 'Show more'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-3">
            <button
              type="button"
              onClick={apply}
              disabled={applying || selected.size === 0}
              className={`${btnBase} border-primary bg-primary text-white hover:opacity-90`}
            >
              {applying ? 'Applying…' : `Apply ${selected.size} selected change${selected.size === 1 ? '' : 's'}`}
            </button>
          </div>
        </>
      )}
    </CollapsibleCard>
  );
}
