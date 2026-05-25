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

const PALETTE_VARS: Record<Palette, Record<string, string>> = {
  forest:  {},
  canyon:  { "--primary": "#7B3A1F", "--primary-deep": "#582410", "--accent": "#D89A3A", "--accent-2": "#C56B3D" },
  glacier: { "--primary": "#2D4F66", "--primary-deep": "#1A3548", "--accent": "#C7864B", "--accent-2": "#D89A3A" },
  dusk:    { "--primary": "#3A2E5C", "--primary-deep": "#241B40", "--accent": "#D9764A", "--accent-2": "#D89A3A" },
};

const PALETTE_CSS_PROPS = ["--primary", "--primary-deep", "--accent", "--accent-2"];

function applyDark(v: boolean) {
  document.documentElement.classList.toggle("dark", v);
}

function applyPalette(p: Palette) {
  PALETTE_CSS_PROPS.forEach((k) => document.documentElement.style.removeProperty(k));
  Object.entries(PALETTE_VARS[p]).forEach(([k, v]) =>
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
  };

  const setPalette = (p: Palette) => {
    setPaletteState(p);
    try { localStorage.setItem("pq-palette", p); } catch {}
    applyPalette(p);
  };

  return (
    <ThemeContext.Provider value={{ dark, setDark, palette, setPalette }}>
      {children}
    </ThemeContext.Provider>
  );
}
