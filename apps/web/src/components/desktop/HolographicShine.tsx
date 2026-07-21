"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Ported from apps/mobile/components/HolographicShine.tsx — same generative
// guilloche/rosette/ribbon geometry, translated from react-native-svg to
// plain SVG (near-identical prop names). The one real change: mobile drives
// the hue-cycling shimmer off the phone's tilt sensor (expo-sensors
// DeviceMotion); desktop has no tilt, so this tracks window mousemove deltas
// instead — phase accumulates cursor movement the same way it accumulated
// tilt change, and the glow brightens with how fast the cursor is moving
// right now, decaying back to rest a moment after it stops.

const PHASE_GAIN = 0.03; // hue-phase advance per px of mouse delta
const MAX_DELTA = 250;   // px — skips teleports (window refocus, tab switch)
const IDLE_DECAY_MS = 420;

const TILT_A = -14; // primary guilloche family — also carries the shimmer
const TILT_B = 11;  // secondary family, crossing the first for a woven look

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

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
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

const N_HUES = 4;
const LINE_INTENSITY = 0.45;
const hueStops = (offsetDeg: number) =>
  [0, 1, 2, 3, 4].map((i) => hslToHex(offsetDeg + i * 72, 0.85, 0.62));

const SEG_SPAN = 400;
const waveSegD = (xOffset: number, y: number, amp: number) =>
  `M${xOffset - 20} ${y} C ${xOffset + 40} ${y - amp}, ${xOffset + 80} ${y + amp}, ${xOffset + 120} ${y} ` +
  `S ${xOffset + 200} ${y - amp}, ${xOffset + 240} ${y} S ${xOffset + 320} ${y + amp}, ${xOffset + 380} ${y}`;

function tiledWaveD(y: number, xStart: number, xEnd: number, amp: number): string {
  let d = "";
  for (let x = xStart; x < xEnd; x += SEG_SPAN) d += waveSegD(x, y, amp) + " ";
  return d;
}

function waveRows(w: number, h: number, yStart: number, rowGap: number, amp: number): string[] {
  const xStart = -0.6 * w;
  const xEnd = 1.6 * w;
  const rows: string[] = [];
  for (let y = yStart; y < 1.6 * h; y += rowGap) rows.push(tiledWaveD(y, xStart, xEnd, amp));
  return rows;
}

function ribbonPaths(w: number, h: number, count = 26): string[] {
  const spread = h * 0.16;
  const steps = 30;
  const base = (t: number) => ({
    x: w * (-0.1 + 0.7 * Math.pow(t, 1.3)),
    y: h * (0.42 + 0.68 * Math.pow(t, 0.75)),
  });
  const paths: string[] = [];
  for (let i = 0; i < count; i++) {
    const off = (i / (count - 1) - 0.5) * 2;
    let d = "";
    let prev = base(0);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const p = base(t);
      const next = base(Math.min(1, t + 1 / steps));
      const tx = next.x - prev.x, ty = next.y - prev.y;
      const len = Math.hypot(tx, ty) || 1;
      const nx = -ty / len, ny = tx / len;
      const wobble =
        Math.sin(t * Math.PI * 1.6 + 0.4) * h * 0.04 +
        off * spread * Math.cos(t * Math.PI * 1.15);
      const x = p.x + nx * wobble;
      const y = p.y + ny * wobble;
      d += `${s === 0 ? "M" : " L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      prev = p;
    }
    paths.push(d);
  }
  return paths;
}

function rosette(cx: number, cy: number, offsetR: number, circR: number, count: number, phase = 0) {
  return Array.from({ length: count }, (_, i) => {
    const a = phase + (i * 2 * Math.PI) / count;
    return { cx: cx + Math.cos(a) * offsetR, cy: cy + Math.sin(a) * offsetR, r: circR };
  });
}

function webBand(cx: number, cy: number, rIn: number, rOut: number, count: number, skip: number) {
  return Array.from({ length: count }, (_, i) => {
    const a1 = (i * 2 * Math.PI) / count;
    const a2 = ((i + skip) * 2 * Math.PI) / count;
    return {
      x1: cx + Math.cos(a1) * rIn, y1: cy + Math.sin(a1) * rIn,
      x2: cx + Math.cos(a2) * rOut, y2: cy + Math.sin(a2) * rOut,
    };
  });
}

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
    <g>
      <circle cx={cx} cy={cy} r={r} stroke={stroke} strokeWidth={strokeWidth} fill="none" />
      <circle cx={cx} cy={cy} r={r * 1.16} stroke={stroke} strokeWidth={strokeWidth * 0.6} fill="none" opacity={0.6} />
      {ticks.map((t, i) => (
        <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={stroke} strokeWidth={strokeWidth} />
      ))}
      <path d={mtn} stroke={stroke} strokeWidth={strokeWidth} fill="none" />
      <circle cx={cx + r * 0.34} cy={cy - r * 0.34} r={r * 0.145} stroke={stroke} strokeWidth={strokeWidth} fill="none" />
    </g>
  );
}

interface Layers {
  rowsA: string[]; rowsB: string[];
  sealCx: number; sealCy: number; sealR: number;
  rosetteCircles: { cx: number; cy: number; r: number }[];
  webLines: { x1: number; y1: number; x2: number; y2: number }[];
  frameRings: number[];
  ribbon: string[];
}

function buildLayers(w: number, h: number): Layers {
  const rowsA = waveRows(w, h, -0.6 * h, h / 9, h * 0.11);
  const rowsB = waveRows(w, h, -0.6 * h + h / 17, h / 7.6, h * 0.08);
  const sealCx = w * 0.82, sealCy = h * 0.5, sealR = h * 0.13;
  const rosetteCircles = [
    ...rosette(sealCx, sealCy, sealR * 1.17, sealR * 0.235, 72),
    ...rosette(sealCx, sealCy, sealR * 1.26, sealR * 0.2, 72, Math.PI / 72),
  ];
  const webLines = [
    ...webBand(sealCx, sealCy, sealR * 1.44, sealR * 1.74, 72, 6),
    ...webBand(sealCx, sealCy, sealR * 1.44, sealR * 1.74, 72, -6),
  ];
  const frameRings = [1.42, 1.76].map((k) => sealR * k);
  const ribbon = ribbonPaths(w, h);
  return { rowsA, rowsB, sealCx, sealCy, sealR, rosetteCircles, webLines, frameRings, ribbon };
}

export function HolographicShine({ edgeTextSize, edgeTextSpan, staticSize }: {
  /** Fixed px size for the vertical PARKQUEST edge text. */
  edgeTextSize?: number;
  /** [startFrac, endFrac] of container height the edge text's letter run spans. */
  edgeTextSpan?: [number, number];
  /** Fixed geometry size in px — skips self-measurement. */
  staticSize?: { w: number; h: number };
} = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<{ w: number; h: number } | null>(null);
  const size = staticSize ?? measured;
  const w = size?.w ?? 0;
  const h = size?.h ?? 0;

  const REST_GLOW = 0.08;
  const [glow, setGlow] = useState(REST_GLOW);
  const REST_PHASE = (N_HUES - 1) / 2;
  const [hueGlows, setHueGlows] = useState<number[]>(() =>
    crossfadeWeights(REST_PHASE, N_HUES).map((wt) => wt * LINE_INTENSITY)
  );
  const phaseRef = useRef(REST_PHASE);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (staticSize || !containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      const width = Math.round(r.width / 16) * 16;
      const height = Math.round(r.height / 16) * 16;
      setMeasured((prev) => (prev && prev.w === width && prev.h === height ? prev : { w: width, h: height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [staticSize]);

  useEffect(() => {
    if (!size) return;
    const onMove = (e: MouseEvent) => {
      const prev = lastPosRef.current;
      lastPosRef.current = { x: e.clientX, y: e.clientY };
      if (!prev) return;
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      if (Math.abs(dx) > MAX_DELTA || Math.abs(dy) > MAX_DELTA) return;

      phaseRef.current += (dx + dy) * PHASE_GAIN;
      const rateMag = clamp((Math.abs(dx) + Math.abs(dy)) / 60, 0, 1);
      setGlow(0.1 + rateMag * 0.34);
      setHueGlows(crossfadeWeights(phaseRef.current, N_HUES).map((wt) => wt * LINE_INTENSITY));

      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => setGlow(REST_GLOW), IDLE_DECAY_MS);
    };
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [size]);

  const layers = useMemo(() => (size ? buildLayers(w, h) : null), [size, w, h]);

  return (
    <div ref={containerRef} style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {size && layers && (
        <>
          {/* Wave lines — always fully colorful. Four copies of the identical
              static geometry, each a quarter-turn of the same 5-stop rainbow;
              cursor movement crossfades their opacity, so color shifts across
              the wheel without any line moving. */}
          {Array.from({ length: N_HUES }).map((_, vi) => (
            <div
              key={vi}
              style={{ position: "absolute", inset: 0, opacity: hueGlows[vi], transition: "opacity 120ms linear" }}
            >
              <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
                <defs>
                  <linearGradient id={`pp-hue${vi}`} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={w} y2={0}>
                    {hueStops(vi * (360 / N_HUES)).map((color, si) => (
                      <stop key={si} offset={si / 4} stopColor={color} />
                    ))}
                  </linearGradient>
                </defs>
                <g transform={`rotate(${TILT_A} ${w / 2} ${h / 2})`}>
                  {layers.rowsA.map((d, i) => (
                    <path key={i} d={d} stroke={`url(#pp-hue${vi})`} strokeWidth={1} fill="none" />
                  ))}
                </g>
              </svg>
            </div>
          ))}

          <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: "absolute", inset: 0 }}>
            <defs>
              <radialGradient id="pp-spotlight" cx="18%" cy="8%" r="70%">
                <stop offset="0" stopColor="#fff8e6" stopOpacity={0.16} />
                <stop offset="1" stopColor="#fff8e6" stopOpacity={0} />
              </radialGradient>
              <radialGradient id="pp-vignette" cx="88%" cy="100%" r="75%">
                <stop offset="0" stopColor="#000000" stopOpacity={0.24} />
                <stop offset="1" stopColor="#000000" stopOpacity={0} />
              </radialGradient>
            </defs>

            <rect x={0} y={0} width={w} height={h} fill="url(#pp-spotlight)" />
            <rect x={0} y={0} width={w} height={h} fill="url(#pp-vignette)" />

            <g transform={`rotate(${TILT_B} ${w / 2} ${h / 2})`}>
              {layers.rowsB.map((d, i) => (
                <path key={i} d={d} stroke="rgba(201,169,74,0.007)" strokeWidth={0.6} fill="none" />
              ))}
            </g>

            <g transform={`rotate(${TILT_A} ${w / 2} ${h / 2})`}>
              <SealMark cx={layers.sealCx} cy={layers.sealCy} r={layers.sealR} stroke="rgba(201,169,74,0.007)" />
              {layers.rosetteCircles.map((c, i) => (
                <circle key={i} cx={c.cx} cy={c.cy} r={c.r} stroke="rgba(142,196,166,0.009)" strokeWidth={0.5} fill="none" />
              ))}
              {layers.webLines.map((l, i) => (
                <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="rgba(120,182,170,0.007)" strokeWidth={0.4} />
              ))}
              {layers.frameRings.map((r, i) => (
                <circle key={i} cx={layers.sealCx} cy={layers.sealCy} r={r} stroke="rgba(120,182,170,0.01)" strokeWidth={i === 0 ? 0.8 : 0.5} fill="none" />
              ))}
            </g>

            <g>
              {layers.ribbon.map((d, i) => (
                <path key={i} d={d} stroke="rgba(142,196,166,0.01)" strokeWidth={0.5} fill="none" />
              ))}
            </g>
          </svg>

          {/* Holo shimmer copy — plain div opacity only */}
          <div style={{ position: "absolute", inset: 0, opacity: glow, transition: "opacity 150ms linear" }}>
            <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
              <defs>
                <linearGradient id="pp-holo" gradientUnits="userSpaceOnUse" x1={-w * 0.2} y1={0} x2={w * 1.2} y2={h}>
                  <stop offset="0" stopColor="#ff6ec7" />
                  <stop offset="0.25" stopColor="#ffd36e" />
                  <stop offset="0.5" stopColor="#6effc0" />
                  <stop offset="0.75" stopColor="#6ec7ff" />
                  <stop offset="1" stopColor="#c76eff" />
                </linearGradient>
              </defs>

              <g transform={`rotate(${TILT_A} ${w / 2} ${h / 2})`} opacity={0.45}>
                <SealMark cx={layers.sealCx} cy={layers.sealCy} r={layers.sealR} stroke="url(#pp-holo)" />
                {layers.rosetteCircles.map((c, i) => (
                  <circle key={i} cx={c.cx} cy={c.cy} r={c.r} stroke="url(#pp-holo)" strokeWidth={0.5} fill="none" />
                ))}
                {layers.webLines.map((l, i) => (
                  <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="url(#pp-holo)" strokeWidth={0.4} />
                ))}
                {layers.frameRings.map((r, i) => (
                  <circle key={i} cx={layers.sealCx} cy={layers.sealCy} r={r} stroke="url(#pp-holo)" strokeWidth={i === 0 ? 0.8 : 0.5} fill="none" />
                ))}
              </g>

              <g opacity={0.45}>
                {layers.ribbon.map((d, i) => (
                  <path key={i} d={d} stroke="url(#pp-holo)" strokeWidth={0.5} fill="none" />
                ))}
              </g>

              {(() => {
                const [startFrac, endFrac] = edgeTextSpan ?? [0.02, 0.98];
                const cy = ((startFrac + endFrac) / 2) * h;
                const runLen = (endFrac - startFrac) * h;
                return (
                  <text
                    x={w - 10}
                    y={cy}
                    fontSize={edgeTextSize ?? Math.max(8, h * 0.08)}
                    fontWeight="700"
                    letterSpacing={2}
                    textAnchor="middle"
                    fill="url(#pp-holo)"
                    transform={`rotate(-90, ${w - 10}, ${cy})`}
                    textLength={runLen}
                    lengthAdjust="spacing"
                  >
                    PARKQUEST
                  </text>
                );
              })()}
            </svg>
          </div>
        </>
      )}
    </div>
  );
}
