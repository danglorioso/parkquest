/**
 * Per-park stamp glyphs — the little illustrated scene stamped in the center
 * of a park's passport stamp (see apps/web/src/app/passport/page.tsx's
 * `Stamp` component and apps/mobile/components/ParkStamp.tsx). Both stamp
 * renderers fill every shape with the stamp's single ink color, so a glyph
 * is just SVG path geometry — no color, no stroke, path `d` data only. Add
 * an entry here to give a park's stamp a real illustrated icon (a mountain
 * range for one, a cactus for a desert park, an arch for Arches, etc.)
 * instead of the shared default mountain/trees/sun scene both renderers
 * fall back to when a park_code has no entry.
 *
 * Shapes render in array order (later shapes draw on top). `fill` defaults
 * to the stamp's ink color; use 'white' only for a knocked-out highlight
 * (e.g. a snow cap), matching the default scene's existing snow cap.
 * `opacity` defaults to 1 — use it for depth (a background shape at lower
 * opacity behind a foreground one), matching the default scene's back
 * mountain (0.38) vs front mountain (0.88).
 *
 * Keep paths within roughly x:14-86, y:34-66 of a 100x100 viewBox — that's
 * the ring's inner face-to-face gap, between the two horizontal band
 * dividers, so the glyph doesn't collide with the arc text above/below it.
 */
export interface StampGlyphShape {
  /** SVG path `d` attribute. */
  d: string;
  fill?: 'ink' | 'white';
  opacity?: number;
}

export type StampGlyph = StampGlyphShape[];

/**
 * Keyed by park_code (e.g. 'yose', 'grca'). Empty until real artwork is
 * added — see the module doc above for the path-data format an illustrator
 * needs to hand back. The web `Stamp` and mobile `ParkStamp` components each
 * render a default fallback scene when a park_code isn't present here.
 */
export const PARK_GLYPHS: Record<string, StampGlyph> = {
  // yose: [
  //   { d: 'M ...', opacity: 0.88 },
  //   { d: 'M ...', fill: 'white', opacity: 0.3 },
  // ],
};

export function getParkGlyph(parkCode: string): StampGlyph | null {
  return PARK_GLYPHS[parkCode] ?? null;
}
