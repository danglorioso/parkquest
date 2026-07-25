import { useCallback, useMemo, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { DeviceMotion } from 'expo-sensors';
import { useFocusEffect } from 'expo-router';
import Svg, {
  Circle, Defs, G, Line, LinearGradient, Path,
  RadialGradient, Rect, Stop, Text as SvgText, TSpan,
} from 'react-native-svg';

// Hue steps advanced per radian of tilt *change* — the phase accumulates
// tilt deltas rather than mapping absolute orientation, so it works the same
// whether the phone lies flat or is held up at a normal in-hand angle, and a
// ~0.01 rad wobble already visibly shifts the blend.
const PHASE_GAIN = 20;
// Deltas above this per 40ms sample are orientation flips/sensor glitches
// (e.g. gamma's sign flip past vertical), not real motion — skipped so the
// colors don't jump a full cycle in one frame.
const MAX_DELTA = 0.35;
const UPDATE_MS = 40; // ~25Hz — smooth enough for a sheen, light on the JS bridge

const TILT_A = -14; // primary guilloche family — also carries the shimmer
const TILT_B = 11;  // secondary family, crossing the first for a woven look

// Solid foil color for the edge logo lockup — flat throughout (unlike the
// url(#holo) gradient used elsewhere in this shimmer layer), matching the
// passport gold used across the app (see profile screen's GOLD constant).
const LOGO_FILL = '#C9A94A';

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

// Triangular crossfade weights across n stops on a RING for a continuous,
// unbounded phase — 1 at the nearest stop, falling linearly to 0 a full step
// away, measured circularly so the fade from the last hue wraps back into
// the first without a seam. Weights always sum to ~1, so blending them as
// layered opacities never dims or brightens the total, only shifts which hue
// dominates — and the cycle repeats forever as the phase keeps growing in
// either direction.
function crossfadeWeights(phase: number, n: number): number[] {
  const p = ((phase % n) + n) % n;
  return Array.from({ length: n }, (_, i) => {
    const d = Math.abs(p - i);
    return clamp(1 - Math.min(d, n - d), 0, 1);
  });
}

function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if      (h < 60)  { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Four variants of the same 5-stop rainbow, each rotated a quarter-turn
// around the hue wheel from the last — crossfading between them (by tilt)
// shifts which hues land where along the line, without moving anything.
const N_HUES = 4;
// crossfadeWeights sums to ~1 across the N_HUES layers — that's "fully
// opaque, solid-colored lines" since hueStops are plain opaque hex, not
// rgba. Scale everything down against this so the lines stay as faint
// background texture, not a solid rainbow drawn over the readable text.
const LINE_INTENSITY = 0.45;
const hueStops = (offsetDeg: number) =>
  [0, 1, 2, 3, 4].map(i => hslToHex(offsetDeg + i * 72, 0.85, 0.62));

// One proven wave-hump shape, 400 units wide — tiled horizontally across
// whatever span is needed, so density scales with the card's real measured
// size instead of a hardcoded viewBox. (A fixed viewBox that didn't match
// the card's actual on-screen aspect ratio previously cropped/misaligned
// the seal and edge text under preserveAspectRatio="slice" — this
// component measures itself via onLayout and builds geometry from the
// real width/height, so there's nothing left to mismatch.)
const SEG_SPAN = 400;
const waveSegD = (xOffset: number, y: number, amp: number) =>
  `M${xOffset - 20} ${y} C ${xOffset + 40} ${y - amp}, ${xOffset + 80} ${y + amp}, ${xOffset + 120} ${y} ` +
  `S ${xOffset + 200} ${y - amp}, ${xOffset + 240} ${y} S ${xOffset + 320} ${y + amp}, ${xOffset + 380} ${y}`;

function tiledWaveD(y: number, xStart: number, xEnd: number, amp: number): string {
  let d = '';
  for (let x = xStart; x < xEnd; x += SEG_SPAN) d += waveSegD(x, y, amp) + ' ';
  return d;
}

function waveRows(w: number, h: number, yStart: number, rowGap: number, amp: number): string[] {
  const xStart = -0.6 * w;
  const xEnd   = 1.6 * w;
  const rows: string[] = [];
  for (let y = yStart; y < 1.6 * h; y += rowGap) rows.push(tiledWaveD(y, xStart, xEnd, amp));
  return rows;
}

// Flowing ribbon mesh — a bundle of near-parallel curves whose offsets flip
// sign along the run (off·cos), so the bundle pinches and crosses itself
// mid-sweep like the braided wave meshes on banknotes. It sweeps around the
// bottom-left corner: enters from the left edge and exits through the bottom
// edge, squaring the corner off, balancing the seal/rosette at top-right.
function ribbonPaths(w: number, h: number, count = 26): string[] {
  const spread = h * 0.16;
  const steps = 30;
  // Corner arc the bundle follows, filling the bottom-left quadrant: enters
  // already off-screen past the left edge (x −0.10w at 0.42h), sweeps
  // through the corner, and exits off-screen below the bottom edge (0.60w,
  // 1.10h) — both ends start/finish outside the visible cover. The eased
  // exponents keep it hugging the left edge before turning out through the
  // bottom.
  const base = (t: number) => ({
    x: w * (-0.10 + 0.70 * Math.pow(t, 1.30)),
    y: h * (0.42 + 0.68 * Math.pow(t, 0.75)),
  });
  const paths: string[] = [];
  for (let i = 0; i < count; i++) {
    const off = (i / (count - 1) - 0.5) * 2; // -1..1 across the bundle
    let d = '';
    let prev = base(0);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const p = base(t);
      // Unit normal of the arc (tangent rotated 90°), from the last sample —
      // offsets ride perpendicular to the sweep so the bundle stays a ribbon
      // through the turn instead of shearing.
      const next = base(Math.min(1, t + 1 / steps));
      const tx = next.x - prev.x, ty = next.y - prev.y;
      const len = Math.hypot(tx, ty) || 1;
      const nx = -ty / len, ny = tx / len;
      const wobble =
        Math.sin(t * Math.PI * 1.6 + 0.4) * h * 0.04 +
        off * spread * Math.cos(t * Math.PI * 1.15);
      const x = p.x + nx * wobble;
      const y = p.y + ny * wobble;
      d += `${s === 0 ? 'M' : ' L'}${x.toFixed(1)} ${y.toFixed(1)}`;
      prev = p;
    }
    paths.push(d);
  }
  return paths;
}

// A ring of overlapping circles around a shared center — the classic
// spirograph/guilloche "rosette" seen on currency and certificates. Each
// circle's own center sits on a small ring (radius offsetR) around (cx,cy);
// with circR slightly less than offsetR, no single circle reaches the true
// center, leaving the small clear hole that gives the flower its shape.
function rosette(cx: number, cy: number, offsetR: number, circR: number, count: number, phase = 0) {
  return Array.from({ length: count }, (_, i) => {
    const a = phase + (i * 2 * Math.PI) / count;
    return { cx: cx + Math.cos(a) * offsetR, cy: cy + Math.sin(a) * offsetR, r: circR };
  });
}

// String-art web: chords from each of `count` points on the inner ring to
// the point `skip` steps around on the outer ring. Rendered with both
// +skip and -skip, the chords cross into the woven net/fan mesh that fills
// the bands between circle rings on engraved certificates.
function webBand(cx: number, cy: number, rIn: number, rOut: number, count: number, skip: number) {
  return Array.from({ length: count }, (_, i) => {
    const a1 = (i * 2 * Math.PI) / count;
    const a2 = ((i + skip) * 2 * Math.PI) / count;
    return {
      x1: cx + Math.cos(a1) * rIn,  y1: cy + Math.sin(a1) * rIn,
      x2: cx + Math.cos(a2) * rOut, y2: cy + Math.sin(a2) * rOut,
    };
  });
}

// Compass-ring + mountain + sun — a simplified line-art take on the app
// icon, used as an engraved "official seal" watermark. Proportioned off
// its own radius so it scales cleanly with the measured card size.
function SealMark({ cx, cy, r, stroke, strokeWidth = 1 }: {
  cx: number; cy: number; r: number; stroke: string; strokeWidth?: number;
}) {
  const ticks = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    return {
      x1: cx + Math.cos(a) * (r - r * 0.18), y1: cy + Math.sin(a) * (r - r * 0.18),
      x2: cx + Math.cos(a) * (r + r * 0.06), y2: cy + Math.sin(a) * (r + r * 0.06),
    };
  });
  const mtn =
    `M${cx - r * 0.63} ${cy + r * 0.47} L${cx - r * 0.21} ${cy - r * 0.26} L${cx} ${cy + r * 0.05} ` +
    `L${cx + r * 0.24} ${cy - r * 0.42} L${cx + r * 0.63} ${cy + r * 0.47} Z`;
  return (
    <G>
      <Circle cx={cx} cy={cy} r={r} stroke={stroke} strokeWidth={strokeWidth} fill="none" />
      <Circle cx={cx} cy={cy} r={r * 1.16} stroke={stroke} strokeWidth={strokeWidth * 0.6} fill="none" opacity={0.6} />
      {ticks.map((t, i) => (
        <Line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={stroke} strokeWidth={strokeWidth} />
      ))}
      <Path d={mtn} stroke={stroke} strokeWidth={strokeWidth} fill="none" />
      <Circle cx={cx + r * 0.34} cy={cy - r * 0.34} r={r * 0.145} stroke={stroke} strokeWidth={strokeWidth} fill="none" />
    </G>
  );
}

// Cover background: a dense, two-angle guilloche lattice (like currency/
// passport security print), a soft static spotlight/vignette for depth, an
// engraved compass/mountain seal, and a holo micro-print strip on the right
// edge — all behind the cover's text siblings by plain document order (this
// renders as their first sibling).
//
// The seal/rosette/text shimmer is a second, identical copy of that art (in
// holo-gradient color) layered on top of the static gold base copy, inside
// a plain Animated.View whose opacity responds to device tilt. The wave
// lines get a different treatment (see N_HUES above): they're always fully
// colorful, never faint gold — tilt crossfades between four hue-rotated
// copies of the same static line geometry, so color shifts across the
// rainbow without the lines themselves moving. Deliberately NOT using
// Reanimated's useAnimatedProps on the SVG gradient/group/text here —
// animating those directly aborts the app (SIGABRT in
// reanimated::ReanimatedCommitHook::shadowTreeWillCommit; react-native-svg's
// Defs/paint-server + group elements aren't safe targets for Reanimated's
// Fabric prop-commit path on this RN/reanimated/svg version combo). Plain
// RN Animated on a normal View only ever touches opacity, which is the
// standard, safe path.
export function HolographicShine({ edgeTextSize, edgeTextSpan, staticSize, lineIntensity, wavesAboveSeal }: {
  /** Fixed px text size for the ParkQuest logo+wordmark lockup on the right
      edge. Defaults to scaling with container height — right for
      card-sized containers, oversized on the passport page's
      near-full-screen cover. */
  edgeTextSize?: number;
  /** [startFrac, endFrac] of container height the logo+wordmark lockup is
      vertically centered within. Defaults to nearly the full height; the
      passport page pins it to the name-through-stats zone instead. */
  edgeTextSpan?: [number, number];
  /** Fixed geometry size in px — skips self-measurement entirely. Use when
      the container's height changes across loading states (e.g. the passport
      cover): measured geometry would rebuild + visibly rescale when content
      lands, whereas a fixed size keeps the pattern rock-steady and lets the
      container's overflow clipping absorb the difference. */
  staticSize?: { w: number; h: number };
  /** Overrides the default 0.45 opacity ceiling for the colorful wave-line
      family — the passport page's near-full-screen cover reads the same
      geometry much larger than the profile card, so it needs to sit fainter
      to stay clear of the identity/stats text on top. */
  lineIntensity?: number;
  /** Stacks the wave lines above the seal/mandala/ribbon group instead of
      below it (the default) — still behind every real text sibling outside
      this component regardless, since that's plain document order one level up. */
  wavesAboveSeal?: boolean;
} = {}) {
  const [measured, setMeasured] = useState<{ w: number; h: number } | null>(null);
  const size = staticSize ?? measured;
  const intensity = lineIntensity ?? LINE_INTENSITY;
  const glow = useRef(new Animated.Value(0.08)).current;
  const REST_PHASE = (N_HUES - 1) / 2;
  const hueGlows = useRef(
    crossfadeWeights(REST_PHASE, N_HUES).map(wt => new Animated.Value(wt * intensity))
  ).current;
  // Unbounded hue phase, advanced by tilt deltas — see the listener below.
  const phaseRef = useRef(REST_PHASE);
  const prevRotRef = useRef<{ beta: number; gamma: number } | null>(null);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    // Quantized to 16px steps — containers whose height settles a few px
    // after first layout (e.g. skeleton → real content swaps) shouldn't
    // rebuild the whole pattern geometry; a visible reshuffle for nothing.
    const width  = Math.round(e.nativeEvent.layout.width / 16) * 16;
    const height = Math.round(e.nativeEvent.layout.height / 16) * 16;
    setMeasured(prev => (prev && prev.w === width && prev.h === height) ? prev : { w: width, h: height });
  }, []);

  const w = size?.w ?? 0;
  const h = size?.h ?? 0;

  // Tabs stay mounted when you switch away (no unmountOnBlur), so a plain
  // useEffect would keep the gyro polling in the background forever —
  // useFocusEffect starts/stops the subscription with screen focus instead.
  useFocusEffect(
    useCallback(() => {
      if (!size) return; // wait for a measured layout before we have a px range to map into
      DeviceMotion.setUpdateInterval(UPDATE_MS);
      const sub = DeviceMotion.addListener(({ rotation }) => {
        if (!rotation) return;
        const { beta, gamma } = rotation;

        // Phase accumulates CHANGE in tilt, both axes summed — not absolute
        // orientation. That makes it orientation-agnostic (works identically
        // held flat or upright in the hand) and endless: keep tilting in any
        // direction and the hues keep cycling around the ring, instead of
        // saturating after one sweep of an absolute range.
        const prev = prevRotRef.current;
        prevRotRef.current = { beta, gamma };
        if (!prev) return;
        const db = beta - prev.beta;
        const dg = gamma - prev.gamma;
        // Orientation flips (gamma's sign jump past vertical) read as huge
        // deltas — skip them so the colors don't leap a cycle in one frame.
        if (Math.abs(db) > MAX_DELTA || Math.abs(dg) > MAX_DELTA) return;
        phaseRef.current += (db + dg) * PHASE_GAIN;

        // Shimmer brightness tracks how fast you're tilting right now.
        const rateMag = clamp((Math.abs(db) + Math.abs(dg)) / 0.02, 0, 1);
        Animated.timing(glow, {
          toValue: 0.10 + rateMag * 0.34, duration: UPDATE_MS * 2, easing: Easing.linear, useNativeDriver: true,
        }).start();

        crossfadeWeights(phaseRef.current, N_HUES).forEach((wt, i) => {
          Animated.timing(hueGlows[i], {
            toValue: wt * intensity, duration: UPDATE_MS, easing: Easing.linear, useNativeDriver: true,
          }).start();
        });
      });
      return () => { sub.remove(); prevRotRef.current = null; };
    // intensity is a per-mount prop, not reactive state — omitted from deps deliberately
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [size, glow, hueGlows])
  );

  const layers = useMemo(() => {
    if (!size) return null;
    const rowsA = waveRows(w, h, -0.6 * h,           h / 9,   h * 0.11); // primary — shimmers
    const rowsB = waveRows(w, h, -0.6 * h + h / 17,   h / 7.6, h * 0.08); // secondary — static crosshatch
    // Kept deliberately small — the seal + mandala is background texture on
    // a card full of real text; at h*0.42 with three bands it dominated.
    // Shrunk further (0.21 → 0.13) so the bottom-left ribbon sweep has the
    // whole lower-left quadrant to itself without tangling with the rings.
    const sealCx = w * 0.82, sealCy = h * 0.5, sealR = h * 0.13;
    // Two interleaved rosette rings — different radius, size, and a
    // half-step phase shift, so the circles weave through each other into a
    // moiré lattice instead of one string of evenly-spaced rings. circR is
    // several times the center-to-center spacing so consecutive circles
    // overlap neighbors deep (spirograph weave, not barely-touching rings).
    // Bands hug the seal — inner rosette ring's near edge basically touches
    // the seal's outline, no dead gap between logo and decoration.
    const rosetteCircles = [
      ...rosette(sealCx, sealCy, sealR * 1.17, sealR * 0.235, 72),
      ...rosette(sealCx, sealCy, sealR * 1.26, sealR * 0.2,   72, Math.PI / 72),
    ];
    // One crossing string-art web band, framed by two solid rings — the
    // outermost circle-ring band from the reference dropped; with the
    // smaller seal it pushed the mandala's footprint back to "distracting".
    const webLines = [
      ...webBand(sealCx, sealCy, sealR * 1.44, sealR * 1.74, 72, 6),
      ...webBand(sealCx, sealCy, sealR * 1.44, sealR * 1.74, 72, -6),
    ];
    const frameRings = [1.42, 1.76].map(k => sealR * k);
    const ribbon = ribbonPaths(w, h);
    return { rowsA, rowsB, sealCx, sealCy, sealR, rosetteCircles, webLines, frameRings, ribbon };
  }, [size, w, h]);

  // Wave lines — always fully colorful (not faint-gold-then-shimmer like the
  // rest of the pattern). Four copies of the identical static geometry, each
  // a different quarter-turn of the same 5-stop rainbow; tilt crossfades
  // their opacity via hueGlows, so color shifts across the wheel without any
  // line moving. Extracted from render order below so wavesAboveSeal can
  // stack it relative to the static seal/mandala/ribbon group — it's still
  // behind every real text sibling outside this component either way, since
  // that's plain document order one level up (this whole component renders
  // as the cover's first child).
  const waveLines = size && layers && Array.from({ length: N_HUES }).map((_, vi) => (
    <Animated.View
      key={vi}
      pointerEvents="none"
      style={[StyleSheet.absoluteFillObject, { opacity: hueGlows[vi] }]}
    >
      <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} pointerEvents="none">
        <Defs>
          <LinearGradient id={`hue${vi}`} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={w} y2={0}>
            {hueStops(vi * (360 / N_HUES)).map((color, si) => (
              <Stop key={si} offset={si / 4} stopColor={color} />
            ))}
          </LinearGradient>
        </Defs>
        <G rotation={TILT_A} origin={[w / 2, h / 2]}>
          {layers.rowsA.map((d, i) => (
            <Path key={i} d={d} stroke={`url(#hue${vi})`} strokeWidth={1} fill="none" />
          ))}
        </G>
      </Svg>
    </Animated.View>
  ));

  const staticSvg = size && layers && (
          <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} pointerEvents="none">
            <Defs>
              <RadialGradient id="spotlight" cx="18%" cy="8%" r="70%">
                <Stop offset="0" stopColor="#fff8e6" stopOpacity={0.16} />
                <Stop offset="1" stopColor="#fff8e6" stopOpacity={0} />
              </RadialGradient>
              <RadialGradient id="vignette" cx="88%" cy="100%" r="75%">
                <Stop offset="0" stopColor="#000000" stopOpacity={0.24} />
                <Stop offset="1" stopColor="#000000" stopOpacity={0} />
              </RadialGradient>
            </Defs>

            {/* Ambient depth — fixed light source, doesn't move with tilt */}
            <Rect x={0} y={0} width={w} height={h} fill="url(#spotlight)" />
            <Rect x={0} y={0} width={w} height={h} fill="url(#vignette)" />

            {/* Secondary crosshatch family — static, crossing angle, denser/thinner.
                Kept faint — this cover now carries real stats/numbers, not just
                decorative identity text, so the pattern has to stay well behind
                it in contrast, not compete with it. */}
            <G rotation={TILT_B} origin={[w / 2, h / 2]}>
              {layers.rowsB.map((d, i) => (
                <Path key={i} d={d} stroke="rgba(201,169,74,0.007)" strokeWidth={0.6} fill="none" />
              ))}
            </G>

            {/* Seal + mandala — static base, always visible, drawn on top of
                the rainbow lines like a stamp impression over paper. Seal
                stays gold (it's the official mark); the surrounding bands go
                muted sage/teal like the engraved-certificate reference, which
                sits naturally against the dark green cover next to the gold. */}
            <G rotation={TILT_A} origin={[w / 2, h / 2]}>
              <SealMark cx={layers.sealCx} cy={layers.sealCy} r={layers.sealR} stroke="rgba(201,169,74,0.007)" />
              {layers.rosetteCircles.map((c, i) => (
                <Circle key={i} cx={c.cx} cy={c.cy} r={c.r} stroke="rgba(142,196,166,0.009)" strokeWidth={0.5} fill="none" />
              ))}
              {layers.webLines.map((l, i) => (
                <Line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="rgba(120,182,170,0.007)" strokeWidth={0.4} />
              ))}
              {layers.frameRings.map((r, i) => (
                <Circle key={i} cx={layers.sealCx} cy={layers.sealCy} r={r} stroke="rgba(120,182,170,0.01)" strokeWidth={i === 0 ? 0.8 : 0.5} fill="none" />
              ))}
            </G>

            {/* Bottom-left corner ribbon mesh — static base copy, faint like
                the mandala's; the shimmer copy below carries the color. */}
            <G>
              {layers.ribbon.map((d, i) => (
                <Path key={i} d={d} stroke="rgba(142,196,166,0.01)" strokeWidth={0.5} fill="none" />
              ))}
            </G>
          </Svg>
  );

  return (
    <View style={StyleSheet.absoluteFillObject} onLayout={staticSize ? undefined : onLayout} pointerEvents="none">
      {size && layers && (
        <>
          {wavesAboveSeal ? staticSvg : waveLines}
          {wavesAboveSeal ? waveLines : staticSvg}

          {/* Holo shimmer copy of the seal/rosette/text — plain Animated.View,
              opacity only. Never touches SVG native props directly (see the
              note above on why). */}
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFillObject, { opacity: glow }]}
          >
            <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} pointerEvents="none">
              <Defs>
                <LinearGradient id="holo" gradientUnits="userSpaceOnUse" x1={-w * 0.2} y1={0} x2={w * 1.2} y2={h}>
                  <Stop offset="0"    stopColor="#ff6ec7" />
                  <Stop offset="0.25" stopColor="#ffd36e" />
                  <Stop offset="0.5"  stopColor="#6effc0" />
                  <Stop offset="0.75" stopColor="#6ec7ff" />
                  <Stop offset="1"    stopColor="#c76eff" />
                </LinearGradient>
              </Defs>

              {/* opacity on the group halves the mandala's share of the tilt
                  shimmer without dimming the ParkQuest logo lockup below it */}
              <G rotation={TILT_A} origin={[w / 2, h / 2]} opacity={0.45}>
                <SealMark cx={layers.sealCx} cy={layers.sealCy} r={layers.sealR} stroke="url(#holo)" />
                {layers.rosetteCircles.map((c, i) => (
                  <Circle key={i} cx={c.cx} cy={c.cy} r={c.r} stroke="url(#holo)" strokeWidth={0.5} fill="none" />
                ))}
                {layers.webLines.map((l, i) => (
                  <Line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="url(#holo)" strokeWidth={0.4} />
                ))}
                {layers.frameRings.map((r, i) => (
                  <Circle key={i} cx={layers.sealCx} cy={layers.sealCy} r={r} stroke="url(#holo)" strokeWidth={i === 0 ? 0.8 : 0.5} fill="none" />
                ))}
              </G>

              {/* Ribbon mesh shimmer — same holo treatment as the mandala */}
              <G opacity={0.45}>
                {layers.ribbon.map((d, i) => (
                  <Path key={i} d={d} stroke="url(#holo)" strokeWidth={0.5} fill="none" />
                ))}
              </G>

              {/* ParkQuest logo + wordmark lockup, upright along the right
                  edge — same mountain glyph + "ParkQuest" wordmark as the
                  feed/profile header's Wordmark component, laid out
                  horizontally then rotated -90 as one group so it climbs
                  the edge exactly like the old rotated PARKQUEST
                  micro-print did. Solid fill (not the holo gradient) so
                  glyph and text read as one flat color throughout, same as
                  a foil stamp. textLength + lengthAdjust="spacing" pins the
                  text run to a fixed width so the icon's position can be
                  computed exactly. */}
              {(() => {
                const [startFrac, endFrac] = edgeTextSpan ?? [0.02, 0.98];
                const cy = ((startFrac + endFrac) / 2) * h;
                const fontSize = edgeTextSize ?? Math.max(8, h * 0.08);
                const iconSize = fontSize / 0.82; // matches Wordmark's icon:text size ratio
                // Rotation pivot sits at the row's own vertical center (cy), so
                // after the -90 turn that vertical thickness becomes the
                // distance from the right edge — pivotX has to back off by
                // half of it, or the icon's top/bottom half is clipped by the
                // card's viewBox instead of sitting flush against the edge.
                const edgePad = 4;
                const pivotX = w - iconSize / 2 - edgePad;
                const gap = fontSize * 0.3;
                const textWidth = fontSize * 5.2; // tuned for "ParkQuest" at this weight
                const totalWidth = iconSize + gap + textWidth;
                const rowStartX = pivotX - totalWidth / 2;
                return (
                  <G transform={`rotate(-90, ${pivotX}, ${cy})`}>
                    <G transform={`translate(${rowStartX}, ${cy - iconSize / 2}) scale(${iconSize / 24})`}>
                      <Path
                        d="M3 20L9 9l3 5 3-7 6 13H3z"
                        stroke={LOGO_FILL}
                        strokeWidth={2.2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                      />
                      <Circle cx={20} cy={4} r={3.5} fill={LOGO_FILL} />
                    </G>
                    <SvgText
                      x={rowStartX + iconSize + gap}
                      y={cy + fontSize * 0.32}
                      fontSize={fontSize}
                      fill={LOGO_FILL}
                      textLength={textWidth}
                      lengthAdjust="spacing"
                    >
                      <TSpan fontWeight="800">Park</TSpan>
                      <TSpan fontWeight="500">Quest</TSpan>
                    </SvgText>
                  </G>
                );
              })()}
            </Svg>
          </Animated.View>
        </>
      )}
    </View>
  );
}
