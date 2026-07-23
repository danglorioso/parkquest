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

/**
 * An admin-uploaded stamp glyph — set via /admin/parks, stored per-park in
 * `parks.stamp_glyph`. Unlike the hand-authored PARK_GLYPHS above (already
 * hand-fit to the stamp's 100x100 canvas), an uploaded icon keeps its own
 * source `viewBox` so `glyphTransform` below can scale/center it into the
 * ring's inner gap without needing to rewrite any path `d` data.
 */
export interface CustomStampGlyph {
  /** The uploaded SVG's own viewBox, e.g. "0 0 24 24". */
  viewBox: string;
  paths: StampGlyphShape[];
}

// Centered box for custom glyphs to land in — runs from just below the
// curved park-name text down to just above the curved state-code text (both
// arcs live outside this range), filling most of the ring's inner face.
const GLYPH_BOX = { x: 30, y: 30, w: 40, h: 40 };

/**
 * Computes a `translate(...) scale(...)` transform that fits a glyph's
 * source viewBox into GLYPH_BOX, uniformly scaled and centered — apply it
 * to a <g>/<G> wrapping the glyph's raw <path> elements.
 */
export function glyphTransform(viewBox: string): string {
  const parts = viewBox.trim().split(/\s+/).map(Number);
  const valid = parts.length === 4 && parts.every((n) => Number.isFinite(n)) && parts[2] > 0 && parts[3] > 0;
  const [minX, minY, w, h] = valid ? parts : [0, 0, 24, 24];

  const scale = Math.min(GLYPH_BOX.w / w, GLYPH_BOX.h / h);
  const tx = GLYPH_BOX.x + (GLYPH_BOX.w - w * scale) / 2 - minX * scale;
  const ty = GLYPH_BOX.y + (GLYPH_BOX.h - h * scale) / 2 - minY * scale;
  return `translate(${tx} ${ty}) scale(${scale})`;
}
