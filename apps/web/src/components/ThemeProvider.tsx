"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type Palette = "forest" | "canyon" | "glacier" | "dusk";

interface ThemeContextValue {
  dark: boolean;
  setDark: (v: boolean) => void;
  palette: Palette;
  setPalette: (p: Palette) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  dark: false,
  setDark: () => {},
  palette: "forest",
  setPalette: () => {},
});

export const useTheme = () => useContext(ThemeContext);

// Light values are what pickers/swatches show; dark values are the brightened
// set used while dark mode is active so primaries stay legible on near-black
// surfaces. Mirrors the mobile app's lib/palette PALETTES.
const PALETTE_VARS: Record<Palette, { light: Record<string, string>; dark: Record<string, string> }> = {
  forest: {
    light: {}, // CSS :root defaults
    dark:  { "--primary": "#4E8264", "--primary-deep": "#2C5240", "--accent": "#D8814F", "--accent-2": "#E0B454" },
  },
  canyon: {
    light: { "--primary": "#7B3A1F", "--primary-deep": "#582410", "--accent": "#D89A3A", "--accent-2": "#C56B3D" },
    dark:  { "--primary": "#B25F38", "--primary-deep": "#7B3A1F", "--accent": "#E2AB52", "--accent-2": "#D8814F" },
  },
  glacier: {
    light: { "--primary": "#2D4F66", "--primary-deep": "#1A3548", "--accent": "#C7864B", "--accent-2": "#D89A3A" },
    dark:  { "--primary": "#5C87A3", "--primary-deep": "#38607C", "--accent": "#D69A60", "--accent-2": "#E0B454" },
  },
  dusk: {
    light: { "--primary": "#3A2E5C", "--primary-deep": "#241B40", "--accent": "#D9764A", "--accent-2": "#D89A3A" },
    dark:  { "--primary": "#7A6BAB", "--primary-deep": "#4E4180", "--accent": "#E28A5F", "--accent-2": "#E0B454" },
  },
};

const PALETTE_CSS_PROPS = ["--primary", "--primary-deep", "--accent", "--accent-2"];

function applyDark(v: boolean) {
  document.documentElement.classList.toggle("dark", v);
}

function applyPalette(p: Palette, dark: boolean) {
  PALETTE_CSS_PROPS.forEach((k) => document.documentElement.style.removeProperty(k));
  Object.entries(PALETTE_VARS[p][dark ? "dark" : "light"]).forEach(([k, v]) =>
    document.documentElement.style.setProperty(k, v)
  );
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [dark, setDarkState] = useState(false);
  const [palette, setPaletteState] = useState<Palette>("forest");

  useEffect(() => {
    try {
      const savedDark = localStorage.getItem("pq-dark") === "1";
      const savedPalette = (localStorage.getItem("pq-palette") ?? "forest") as Palette;
      setDarkState(savedDark);
      setPaletteState(savedPalette);
      // DOM is already set by the inline script in layout — just sync state
    } catch {
      /* ignore */
    }
  }, []);

  const setDark = (v: boolean) => {
    setDarkState(v);
    try { localStorage.setItem("pq-dark", v ? "1" : "0"); } catch {}
    applyDark(v);
    // Palette primaries swap to their brightened dark variants
    applyPalette(palette, v);
  };

  const setPalette = (p: Palette) => {
    setPaletteState(p);
    try { localStorage.setItem("pq-palette", p); } catch {}
    applyPalette(p, dark);
  };

  return (
    <ThemeContext.Provider value={{ dark, setDark, palette, setPalette }}>
      {children}
    </ThemeContext.Provider>
  );
}
