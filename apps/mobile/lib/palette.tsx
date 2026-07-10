import { createContext, useContext, useEffect, useState } from 'react';
import { Appearance, DynamicColorIOS, Platform, useColorScheme, type ColorValue } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// A color that resolves per the active UIUserInterfaceStyle on iOS. Because
// resolution happens natively at draw time, these are safe at module scope
// (e.g. inside StyleSheet.create) and flip instantly when the theme changes.
// Android has no native dynamic colors here, so it stays on the light value
// (the in-app theme toggle is iOS-only for now — see useThemeMode).
export const dyn = (light: string, dark: string): ColorValue =>
  Platform.OS === 'ios' ? DynamicColorIOS({ light, dark }) : light;

// For third-party props typed `string` that nonetheless run through
// processColor natively (navigation headers, tab icons, svg fills).
export const colorStr = (c: ColorValue): string => c as unknown as string;

// Neutral tokens that are identical in every palette. Safe to use at module
// scope (e.g. inside StyleSheet.create); theme-dependent colors are not.
// NOTE: these are opaque ColorValues, not strings — never concatenate alpha
// suffixes onto them (`C.ink + '22'` breaks). Use the *Soft/Mute/hairline
// variants or an rgba literal instead.
export const STATIC = {
  bg:           dyn('#F2EBDB', '#171511'),
  surface:      dyn('#FFFBF1', '#201D17'),
  surfaceAlt:   dyn('#F7F0DE', '#28241C'),
  ink:          dyn('#1B1A16', '#F0EAD9'),
  inkSoft:      dyn('#3C3A33', '#CDC6B5'),
  inkMute:      dyn('#7A746A', '#948D7E'),
  hairline:     dyn('rgba(27,26,22,0.10)', 'rgba(240,234,217,0.14)'),
  hairlineSoft: dyn('rgba(27,26,22,0.06)', 'rgba(240,234,217,0.08)'),
  visited:      dyn('#2F7A4A', '#4FA76C'),
  bucket:       dyn('#C48A20', '#D9A63E'),
  liked:        dyn('#D45040', '#E2685A'),
  // Text/icon color on primary- or accent-filled surfaces (all palettes are dark enough).
  onPrimary:    '#FFFBF1' as ColorValue,
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

// Palette accents stay plain strings (call sites concatenate alpha suffixes
// like `${C.primary}14`), so dark variants are swapped via context instead of
// DynamicColorIOS. `colors` is what pickers/swatches show; `dark` is the
// brightened set used while dark mode is active so primaries stay legible on
// near-black surfaces.
export const PALETTES: { id: PaletteId; label: string; colors: PaletteColors; dark: PaletteColors }[] = [
  {
    id: 'forest', label: 'Forest',
    colors: { primary: '#1F3D2E', primaryDeep: '#152A20', accent: '#C56B3D', fabAccent: '#C56B3D' },
    dark:   { primary: '#4E8264', primaryDeep: '#2C5240', accent: '#D8814F', fabAccent: '#D8814F' },
  },
  {
    id: 'canyon', label: 'Canyon',
    colors: { primary: '#7B3A1F', primaryDeep: '#582410', accent: '#D89A3A', fabAccent: '#369EC9' },
    dark:   { primary: '#B25F38', primaryDeep: '#7B3A1F', accent: '#E2AB52', fabAccent: '#54B2D8' },
  },
  {
    id: 'glacier', label: 'Glacier',
    colors: { primary: '#2D4F66', primaryDeep: '#1A3548', accent: '#C7864B', fabAccent: '#D03947' },
    dark:   { primary: '#5C87A3', primaryDeep: '#38607C', accent: '#D69A60', fabAccent: '#DE5A66' },
  },
  {
    id: 'dusk', label: 'Dusk',
    colors: { primary: '#3A2E5C', primaryDeep: '#241B40', accent: '#D9764A', fabAccent: '#8AA63A' },
    dark:   { primary: '#7A6BAB', primaryDeep: '#4E4180', accent: '#E28A5F', fabAccent: '#A3BF55' },
  },
];

export type ThemeMode = 'system' | 'light' | 'dark';
const THEME_MODE_KEY = 'pq-theme-mode';

interface PaletteContextValue {
  paletteId: PaletteId;
  colors: PaletteColors;
  setPalette: (id: PaletteId) => void;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
}

const DEFAULT_PALETTE = PALETTES[0];

const PaletteContext = createContext<PaletteContextValue>({
  paletteId: DEFAULT_PALETTE.id,
  colors: DEFAULT_PALETTE.colors,
  setPalette: () => {},
  themeMode: 'system',
  setThemeMode: () => {},
});

// Resolved scheme for the app. Reflects both the system setting and any
// in-app override applied through Appearance.setColorScheme. Android is
// pinned to light until it gets a real dark pass (STATIC can't flip there).
function useResolvedScheme(): 'light' | 'dark' {
  const scheme = useColorScheme();
  if (Platform.OS !== 'ios') return 'light';
  return scheme === 'dark' ? 'dark' : 'light';
}

function applyThemeMode(mode: ThemeMode) {
  if (Platform.OS !== 'ios') return;
  // Sets overrideUserInterfaceStyle on every window, so DynamicColorIOS
  // colors, MapView, blur materials and the keyboard all follow along.
  Appearance.setColorScheme(mode === 'system' ? null : mode);
}

export function PaletteProvider({ children }: { children: React.ReactNode }) {
  const [paletteId, setPaletteId] = useState<PaletteId>(DEFAULT_PALETTE.id);
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    AsyncStorage.getItem('pq-palette').then(saved => {
      const match = PALETTES.find(p => p.id === saved);
      if (match) setPaletteId(match.id);
    });
    AsyncStorage.getItem(THEME_MODE_KEY).then(saved => {
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        setThemeModeState(saved);
        applyThemeMode(saved);
      }
    });
  }, []);

  const setPalette = (id: PaletteId) => {
    setPaletteId(id);
    AsyncStorage.setItem('pq-palette', id);
  };

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    applyThemeMode(mode);
    AsyncStorage.setItem(THEME_MODE_KEY, mode);
  };

  const scheme = useResolvedScheme();
  const entry = PALETTES.find(p => p.id === paletteId)!;
  const colors = scheme === 'dark' ? entry.dark : entry.colors;

  return (
    <PaletteContext.Provider value={{ paletteId, colors, setPalette, themeMode, setThemeMode }}>
      {children}
    </PaletteContext.Provider>
  );
}

export const usePalette = () => useContext(PaletteContext);

export function useThemeMode() {
  const { themeMode, setThemeMode } = useContext(PaletteContext);
  return { themeMode, setThemeMode };
}

export type Colors = typeof STATIC & PaletteColors;

// Per-palette color sets, built once per scheme — stable references so hook
// consumers and the useThemedStyles cache can key off identity.
const COLOR_SETS: Record<string, Colors> = {};
function colorSet(paletteId: PaletteId, scheme: 'light' | 'dark'): Colors {
  const key = `${paletteId}:${scheme}`;
  if (!COLOR_SETS[key]) {
    const entry = PALETTES.find(p => p.id === paletteId)!;
    COLOR_SETS[key] = { ...STATIC, ...(scheme === 'dark' ? entry.dark : entry.colors) };
  }
  return COLOR_SETS[key];
}

export function useColors(): Colors {
  const { paletteId } = useContext(PaletteContext);
  const scheme = useResolvedScheme();
  return colorSet(paletteId, scheme);
}

// Theme-aware replacement for a module-level `StyleSheet.create`.
// Usage:
//   const makeStyles = (C: Colors) => StyleSheet.create({ ... });
//   ...inside a component: const styles = useThemedStyles(makeStyles);
// The factory runs once per palette+scheme (cached), so this costs a map
// lookup per render and every component in the file shares the same sheet.
const styleCache = new WeakMap<(c: Colors) => unknown, Map<string, unknown>>();

export function useThemedStyles<T>(factory: (c: Colors) => T): T {
  const { paletteId } = useContext(PaletteContext);
  const scheme = useResolvedScheme();
  const key = `${paletteId}:${scheme}`;
  let byKey = styleCache.get(factory);
  if (!byKey) {
    byKey = new Map();
    styleCache.set(factory, byKey);
  }
  if (!byKey.has(key)) {
    byKey.set(key, factory(colorSet(paletteId, scheme)));
  }
  return byKey.get(key) as T;
}
