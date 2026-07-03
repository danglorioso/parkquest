import { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type PaletteId = 'forest' | 'canyon' | 'glacier' | 'dusk';

export interface PaletteColors {
  primary: string;
  primaryDeep: string;
  accent: string;
}

export const PALETTES: { id: PaletteId; label: string; colors: PaletteColors }[] = [
  { id: 'forest',  label: 'Forest',  colors: { primary: '#1F3D2E', primaryDeep: '#152A20', accent: '#C56B3D' } },
  { id: 'canyon',  label: 'Canyon',  colors: { primary: '#7B3A1F', primaryDeep: '#582410', accent: '#D89A3A' } },
  { id: 'glacier', label: 'Glacier', colors: { primary: '#2D4F66', primaryDeep: '#1A3548', accent: '#C7864B' } },
  { id: 'dusk',    label: 'Dusk',    colors: { primary: '#3A2E5C', primaryDeep: '#241B40', accent: '#D9764A' } },
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

export function useColors() {
  const { colors } = useContext(PaletteContext);
  return {
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
    primary:      colors.primary,
    primaryDeep:  colors.primaryDeep,
    accent:       colors.accent,
  };
}
