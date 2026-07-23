'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { ParkStamp } from '@/components/desktop/ParkStamp';
import type { CustomStampGlyph, StampGlyphShape } from '@parkquest/types';

interface ParkRow {
  park_code: string;
  name: string;
  states: string;
  stamp_glyph: CustomStampGlyph | null;
}

const fieldClass =
  'w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-mute focus:outline-none focus:ring-2 focus:ring-primary/40';

const btnBase =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50';

// Parses an uploaded icon SVG into the { viewBox, paths } shape stored in
// parks.stamp_glyph. Only <path> elements are supported — that covers most
// icon sets (Lucide, Font Awesome solid, Material Symbols, etc.); fill="none"
// stroke-only outline paths are dropped since the stamp always fills with a
// single ink color and an outline path fills into an unpredictable blob.
function parseGlyphSvg(text: string): CustomStampGlyph | string {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  if (doc.querySelector('parsererror')) return 'Could not parse this file as SVG';

  const svgEl = doc.querySelector('svg');
  if (!svgEl) return 'No <svg> root element found';
  const viewBox = svgEl.getAttribute('viewBox')?.trim() || '0 0 24 24';

  const paths: StampGlyphShape[] = [];
  for (const el of Array.from(doc.querySelectorAll('path'))) {
    const d = el.getAttribute('d');
    if (!d) continue;
    const fillAttr = (el.getAttribute('fill') || '').trim().toLowerCase();
    if (fillAttr === 'none') continue;
    const fill: 'white' | undefined = ['white', '#fff', '#ffffff'].includes(fillAttr) ? 'white' : undefined;
    const opacityAttr = el.getAttribute('opacity') ?? el.getAttribute('fill-opacity');
    const opacity = opacityAttr !== null ? Number(opacityAttr) : undefined;
    paths.push({ d, fill, opacity: opacity !== undefined && Number.isFinite(opacity) ? opacity : undefined });
  }

  if (paths.length === 0) {
    return 'No fillable <path> elements found — outline/stroke-only icons aren’t supported, use a solid/filled icon';
  }
  return { viewBox, paths };
}

export default function StampGlyphManager() {
  const [parks, setParks] = useState<ParkRow[] | null>(null);
  const [selected, setSelected] = useState('');
  const [pendingGlyph, setPendingGlyph] = useState<CustomStampGlyph | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/admin/parks?sort=name&dir=asc')
      .then((r) => r.json())
      .then((d) => setParks(d.parks ?? []));
  }, []);

  const selectedPark = useMemo(() => parks?.find((p) => p.park_code === selected) ?? null, [parks, selected]);

  const pickPark = (code: string) => {
    setSelected(code);
    setPendingGlyph(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const onFile = async (file: File) => {
    setError(null);
    const text = await file.text();
    const parsed = parseGlyphSvg(text);
    if (typeof parsed === 'string') {
      setError(parsed);
      setPendingGlyph(null);
      return;
    }
    setPendingGlyph(parsed);
  };

  const save = async () => {
    if (!selectedPark || !pendingGlyph) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/admin/parks/${selectedPark.park_code}/stamp-glyph`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pendingGlyph),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const body = await res?.json().catch(() => null);
      setError(body?.error ?? 'Failed to save stamp glyph');
      return;
    }
    setParks((prev) => prev?.map((p) => (p.park_code === selectedPark.park_code ? { ...p, stamp_glyph: pendingGlyph } : p)) ?? prev);
    setPendingGlyph(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const clear = async () => {
    if (!selectedPark) return;
    const ok = window.confirm(`Remove the custom stamp icon for ${selectedPark.name}? It'll fall back to the default artwork.`);
    if (!ok) return;
    setSaving(true);
    setError(null);
    await fetch(`/api/admin/parks/${selectedPark.park_code}/stamp-glyph`, { method: 'DELETE' }).catch(() => null);
    setSaving(false);
    setParks((prev) => prev?.map((p) => (p.park_code === selectedPark.park_code ? { ...p, stamp_glyph: null } : p)) ?? prev);
    setPendingGlyph(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <Card className="border-hairline p-5 shadow-[var(--shadow-card)]">
      <div>
        <h2 className="text-lg font-bold text-ink">Stamp glyphs</h2>
        <p className="mt-0.5 text-sm text-ink-mute">
          Upload a square SVG icon (a monument, landmark, or symbol from the park) to replace the
          center art on that park&apos;s passport stamp. Works best with solid/filled icons —
          only &lt;path&gt; elements are read, and outline-only icons won&apos;t render.
        </p>
      </div>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
        <select
          className={`${fieldClass} sm:max-w-xs`}
          value={selected}
          onChange={(e) => pickPark(e.target.value)}
        >
          <option value="">{parks === null ? 'Loading parks…' : 'Select a park…'}</option>
          {parks?.map((p) => (
            <option key={p.park_code} value={p.park_code}>
              {p.name}{p.stamp_glyph ? ' • custom icon' : ''}
            </option>
          ))}
        </select>

        {selectedPark && (
          <div className="flex flex-1 flex-wrap items-start gap-6 rounded-xl border border-hairline p-4">
            <div className="flex flex-col items-center gap-1">
              <ParkStamp
                parkCode={selectedPark.park_code}
                name={selectedPark.name}
                states={selectedPark.states}
                colorIdx={0}
                rotated={false}
                size={100}
                customGlyph={pendingGlyph ?? selectedPark.stamp_glyph}
              />
              <span className="text-xs text-ink-mute">{pendingGlyph ? 'New (unsaved)' : selectedPark.stamp_glyph ? 'Current custom icon' : 'Default artwork'}</span>
            </div>

            <div className="flex min-w-[220px] flex-1 flex-col gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".svg,image/svg+xml"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`${btnBase} border-hairline bg-surface text-ink hover:bg-surface-alt`}
              >
                <Upload className="h-4 w-4" /> Upload SVG
              </button>

              {error && <p className="text-sm font-medium text-red-600">{error}</p>}

              <div className="flex gap-2">
                {pendingGlyph && (
                  <>
                    <button
                      type="button"
                      onClick={save}
                      disabled={saving}
                      className={`${btnBase} border-primary bg-primary text-white hover:opacity-90`}
                    >
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setPendingGlyph(null); setError(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                      className={`${btnBase} border-hairline bg-surface text-ink hover:bg-surface-alt`}
                    >
                      <X className="h-4 w-4" /> Discard
                    </button>
                  </>
                )}
                {!pendingGlyph && selectedPark.stamp_glyph && (
                  <button
                    type="button"
                    onClick={clear}
                    disabled={saving}
                    className={`${btnBase} border-hairline bg-surface text-red-600 hover:bg-surface-alt`}
                  >
                    Clear custom icon
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
