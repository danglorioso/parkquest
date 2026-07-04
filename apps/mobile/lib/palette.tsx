import { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Neutral tokens that are identical in every palette. Safe to use at module
// scope (e.g. inside StyleSheet.create); theme-dependent colors are not.
export const STATIC = {
  bg:           '#F2EBDB',
  surface:      '#FFFBF1',
  surfaceAlt:   '#F7F0DE',
  ink:          '#1B1A16',
  inkSoft:      '#3C3A33',
  inkMute:      '#7A746A',
  hairline:     'rgba(27,26,22,0.10)',
  hairlineSoft: 'rgba(27,26,22,0.06)',
  visited:      '#2F7A4A',
  bucket:       '#C48A20',
  liked:        '#D45040',
  // Text/icon color on primary- or accent-filled surfaces (all palettes are dark enough).
  onPrimary:    '#FFFBF1',
} as const;

export type PaletteId = 'forest' | 'canyon' | 'glacier' | 'dusk';

export interface PaletteColors {
  primary: string;
  primaryDeep: string;
  accent: string;
  // Color-wheel complement of `primary`, reserved for the floating log-visit
  // FAB so it pops against the tab bar without recoloring stars/badges/danger
  // text, which key off `accent`.
  fabAccent: string;
}

export const PALETTES: { id: PaletteId; label: string; colors: PaletteColors }[] = [
  { id: 'forest',  label: 'Forest',  colors: { primary: '#1F3D2E', primaryDeep: '#152A20', accent: '#C56B3D', fabAccent: '#C9367F' } },
  { id: 'canyon',  label: 'Canyon',  colors: { primary: '#7B3A1F', primaryDeep: '#582410', accent: '#D89A3A', fabAccent: '#369EC9' } },
  { id: 'glacier', label: 'Glacier', colors: { primary: '#2D4F66', primaryDeep: '#1A3548', accent: '#C7864B', fabAccent: '#D03947' } },
  { id: 'dusk',    label: 'Dusk',    colors: { primary: '#3A2E5C', primaryDeep: '#241B40', accent: '#D9764A', fabAccent: '#8AA63A' } },
];

interface PaletteContextValue {
  paletteId: PaletteId;
  colors: PaletteColors;
  setPalette: (id: PaletteId) => void;
}

const DEFAULT_PALETTE = PALETTES[0];

const PaletteContext = createContext<PaletteContextValue>({
  paletteId: DEFAULT_PALETTE.id,
  colors: DEFAULT_PALETTE.colors,
  setPalette: () => {},
});

export function PaletteProvider({ children }: { children: React.ReactNode }) {
  const [paletteId, setPaletteId] = useState<PaletteId>(DEFAULT_PALETTE.id);

  useEffect(() => {
    AsyncStorage.getItem('pq-palette').then(saved => {
      const match = PALETTES.find(p => p.id === saved);
      if (match) setPaletteId(match.id);
    });
  }, []);

  const setPalette = (id: PaletteId) => {
    setPaletteId(id);
    AsyncStorage.setItem('pq-palette', id);
  };

  const colors = PALETTES.find(p => p.id === paletteId)!.colors;

  return (
    <PaletteContext.Provider value={{ paletteId, colors, setPalette }}>
      {children}
    </PaletteContext.Provider>
  );
}

export const usePalette = () => useContext(PaletteContext);

export type Colors = typeof STATIC & PaletteColors;

// Per-palette color sets, built once — stable references so hook consumers
// and the useThemedStyles cache can key off identity.
const COLOR_SETS: Record<PaletteId, Colors> = Object.fromEntries(
  PALETTES.map(p => [p.id, { ...STATIC, ...p.colors }]),
) as Record<PaletteId, Colors>;

export function useColors(): Colors {
  const { paletteId } = useContext(PaletteContext);
  return COLOR_SETS[paletteId];
}

// Theme-aware replacement for a module-level `StyleSheet.create`.
// Usage:
//   const makeStyles = (C: Colors) => StyleSheet.create({ ... });
//   ...inside a component: const styles = useThemedStyles(makeStyles);
// The factory runs once per palette (cached), so this costs a map lookup
// per render and every component in the file shares the same sheet.
const styleCache = new WeakMap<(c: Colors) => unknown, Map<PaletteId, unknown>>();

export function useThemedStyles<T>(factory: (c: Colors) => T): T {
  const { paletteId } = useContext(PaletteContext);
  let byPalette = styleCache.get(factory);
  if (!byPalette) {
    byPalette = new Map();
    styleCache.set(factory, byPalette);
  }
  if (!byPalette.has(paletteId)) {
    byPalette.set(paletteId, factory(COLOR_SETS[paletteId]));
  }
  return byPalette.get(paletteId) as T;
}
