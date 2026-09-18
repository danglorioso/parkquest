"use client";

import { getParkGlyph, glyphTransform, type CustomStampGlyph } from "@parkquest/types";

// ── Stamp palette + helpers ───────────────────────────────────────────────────
// Ported from apps/mobile/components/ParkStamp.tsx — same seeded ink-worn
// texture, scalloped edge, and arc-text layout, translated from
// react-native-svg to plain SVG (the two share almost identical prop names).

const STAMP_COLORS = ["#5A2418", "#1F3D2E", "#2D4F66", "#3A2E5C", "#7B3A1F"];
const STAMP_COLORS_DARK = ["#E0A98C", "#7FCBA0", "#8FBEDE", "#B3A0E0", "#E8B37E"];

const TEXT_ARC_R = 33; // matches the topId/botId path radius below
const TEXT_ARC_LEN = Math.PI * TEXT_ARC_R; // semicircle (180° sweep)
const STATE_TEXT_LEN = 44; // forced glyph width for "★ XX ★" at fontSize 6.5
const STATE_START_OFFSET = `${(((TEXT_ARC_LEN - STATE_TEXT_LEN) / 2 / TEXT_ARC_LEN) * 100).toFixed(2)}%`;
const NAME_ARC_MAX_LEN = TEXT_ARC_LEN - 6;

/** startOffset that centers a forced-width run of text on the shared name/state arc. */
function centerOffset(textLen: number): string {
  return `${(((TEXT_ARC_LEN - textLen) / 2 / TEXT_ARC_LEN) * 100).toFixed(2)}%`;
}

// ── Perforated edge ───────────────────────────────────────────────────────────
// Die-cut/perforated silhouette real postage stamps have, instead of a plain
// circular border — see apps/mobile/components/ParkStamp.tsx for the full
// derivation of the control-point math.
function scallopedCirclePath(cx: number, cy: number, rBase: number, amplitude: number, count: number): string {
  const step = (Math.PI * 2) / count;
  const pt = (theta: number, r: number) => ({ x: cx + r * Math.cos(theta), y: cy + r * Math.sin(theta) });
  const base = Array.from({ length: count + 1 }, (_, i) => pt(i * step, rBase));
  let d = `M ${base[0].x.toFixed(2)} ${base[0].y.toFixed(2)} `;
  for (let i = 0; i < count; i++) {
    const a = base[i], b = base[i + 1];
    const peak = pt((i + 0.5) * step, rBase + amplitude);
    const ctrl = { x: 2 * peak.x - 0.5 * (a.x + b.x), y: 2 * peak.y - 0.5 * (a.y + b.y) };
    d += `Q ${ctrl.x.toFixed(2)} ${ctrl.y.toFixed(2)} ${b.x.toFixed(2)} ${b.y.toFixed(2)} `;
  }
  return d + "Z";
}
const OUTER_SCALLOP = scallopedCirclePath(50, 50, 44, 3, 30);

export function stampColor(idx: number, dark = false): string {
  return (dark ? STAMP_COLORS_DARK : STAMP_COLORS)[idx % STAMP_COLORS.length];
}

// ── Ink-worn texture ─────────────────────────────────────────────────────────

function seededRand(seed: string, i: number): number {
  let h = 0;
  const s = `${seed}#${i}`;
  for (let k = 0; k < s.length; k++) h = (h * 31 + s.charCodeAt(k)) >>> 0;
  return (h % 10000) / 10000;
}

function inkSpecks(seed: string, count: number): { x: number; y: number; r: number; op: number }[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = seededRand(seed, i * 4) * Math.PI * 2;
    const radius = 26 + seededRand(seed, i * 4 + 1) * 22;
    return {
      x: 50 + Math.cos(angle) * radius,
      y: 50 + Math.sin(angle) * radius,
      r: 0.3 + seededRand(seed, i * 4 + 2) * 0.6,
      op: 0.08 + seededRand(seed, i * 4 + 3) * 0.22,
    };
  });
}

function inkBlotches(seed: string, count: number): { x: number; y: number; rx: number; ry: number; rot: number; op: number }[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = seededRand(seed, i * 5 + 500) * Math.PI * 2;
    const radius = 20 + seededRand(seed, i * 5 + 501) * 24;
    return {
      x: 50 + Math.cos(angle) * radius,
      y: 50 + Math.sin(angle) * radius,
      rx: 1.8 + seededRand(seed, i * 5 + 502) * 2.6,
      ry: 0.8 + seededRand(seed, i * 5 + 503) * 1.4,
      rot: seededRand(seed, i * 5 + 504) * 180,
      op: 0.03 + seededRand(seed, i * 5 + 505) * 0.05,
    };
  });
}

const STATE_ABBR: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA",
  Colorado: "CO", Connecticut: "CT", Delaware: "DE", Florida: "FL", Georgia: "GA",
  Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA",
  Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD",
  Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS",
  Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH",
  "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY", "North Carolina": "NC",
  "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA",
  "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD",
  Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT", Virginia: "VA",
  Washington: "WA", "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY",
};

export function stateCode(states: string): string {
  const first = states.split(",")[0]?.trim() ?? states;
  if (first.length <= 3) return first.toUpperCase();
  return STATE_ABBR[first] ?? first.slice(0, 2).toUpperCase();
}

// ── ParkStamp ─────────────────────────────────────────────────────────────────

export function ParkStamp({
  parkCode, name, states, colorIdx, size = 96, rotated = true, idSuffix = "", inkColor, customGlyph, dark = false,
}: {
  parkCode: string;
  name: string;
  states: string;
  colorIdx: number;
  size?: number;
  rotated?: boolean;
  /** Keeps <textPath> def ids unique when the same park renders twice on one page. */
  idSuffix?: string;
  /** Override the seeded park ink — e.g. gold foil on the dark passport cover. */
  inkColor?: string;
  /** Admin-uploaded center icon (parks.stamp_glyph) — takes priority over the hand-authored PARK_GLYPHS. */
  customGlyph?: CustomStampGlyph | null;
  /** Renders against a dark page — picks the lightened ink variant instead of the paper-tuned default. Ignored when inkColor is set. */
  dark?: boolean;
}) {
  const c = inkColor ?? stampColor(colorIdx, dark);
  const sc = stateCode(states);
  const hasCustomGlyph = !!customGlyph?.paths?.length;
  const raw = name.toUpperCase().replace(/NATIONAL PARK/g, "").replace(/\s+/g, " ").trim();
  const shortName = raw.length > 30 ? raw.slice(0, 28) + "…" : raw;
  const nameFontSize = shortName.length > 24 ? 6 : shortName.length > 16 ? 7 : shortName.length > 13 ? 7.5 : shortName.length > 10 ? 8 : 9;
  const nameLetterSpacing = 1.5;
  const nameNaturalLen = shortName.length * (nameFontSize * 0.62 + nameLetterSpacing);
  const nameTextLen = Math.min(nameNaturalLen, NAME_ARC_MAX_LEN);
  const nameStartOffset = centerOffset(nameTextLen);
  const rotate = rotated ? `${((colorIdx * 37) % 16) - 8}deg` : "0deg";
  const topId = `top-${parkCode}${idSuffix}`;
  const botId = `bot-${parkCode}${idSuffix}`;
  const bleedId = `bleed-${parkCode}${idSuffix}`;

  const specks = inkSpecks(parkCode, 16);
  const blotches = inkBlotches(parkCode, 8);
  const ghostDx = (seededRand(parkCode, 900) - 0.5) * 1.6;
  const ghostDy = (seededRand(parkCode, 901) - 0.5) * 1.6;
  const ghostRotate = (seededRand(parkCode, 902) - 0.5) * 6;

  return (
    <div style={{ transform: `rotate(${rotate})`, width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 100 100">
        <defs>
          <path id={topId} d="M 17 55 A 33 33 0 0 1 83 55" />
          <path id={botId} d="M 17 50 A 33 33 0 0 0 83 50" />
          <radialGradient id={bleedId} cx="50%" cy="50%" r="50%">
            <stop offset="70%" stopColor={c} stopOpacity="0" />
            <stop offset="100%" stopColor={c} stopOpacity="0.16" />
          </radialGradient>
        </defs>

        {/* Ink-bleed halo — paper soaking up ink at the ring's edge */}
        <circle cx="50" cy="50" r="48" fill={`url(#${bleedId})`} />

        {/* Faint double-strike ghost, offset */}
        <g transform={`translate(${ghostDx} ${ghostDy}) rotate(${ghostRotate} 50 50)`} opacity="0.14">
          <circle cx="50" cy="50" r="44" fill="none" stroke={c} strokeWidth="3.5" />
          <circle cx="50" cy="50" r="37" fill="none" stroke={c} strokeWidth="1.1" />
        </g>

        {/* Emboss bevel — light/dark offset pair behind the main rings,
            following the scalloped silhouette so it doesn't drift in and
            out from under the ring at every bump */}
        <g transform="translate(-0.6 -0.6)">
          <path d={OUTER_SCALLOP} fill="none" stroke="white" strokeWidth="1.1" opacity="0.3" />
        </g>
        <g transform="translate(0.6 0.6)">
          <path d={OUTER_SCALLOP} fill="none" stroke="black" strokeWidth="1.1" opacity="0.22" />
        </g>

        {/* Outer edge — perforated/scalloped like a real postage stamp's
            die-cut border. Inner ring stays a plain line. */}
        <path d={OUTER_SCALLOP} fill="none" stroke={c} strokeWidth="3.5" opacity="0.92" strokeLinejoin="round" />
        <circle cx="50" cy="50" r="40.5" fill="none" stroke={c} strokeWidth="1" opacity="0.75" />

        {/* Ink specks */}
        {specks.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill={c} opacity={s.op} />
        ))}

        {/* Ink blotches — coarser, elongated pooling alongside the fine
            specks above */}
        {blotches.map((b, i) => (
          <ellipse
            key={i} cx={b.x} cy={b.y} rx={b.rx} ry={b.ry} fill={c} opacity={b.op}
            transform={`rotate(${b.rot} ${b.x} ${b.y})`}
          />
        ))}

        {/* Tick marks between rings at 8 positions */}
        {([
          ["88.5", "50", "93", "50"], ["11.5", "50", "7", "50"],
          ["50", "88.5", "50", "93"], ["50", "11.5", "50", "7"],
          ["77.2", "77.2", "80.4", "80.4"], ["22.8", "77.2", "19.6", "80.4"],
          ["22.8", "22.8", "19.6", "19.6"], ["77.2", "22.8", "80.4", "19.6"],
        ] as const).map(([x1, y1, x2, y2], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={c} strokeWidth="1.4" opacity={0.6 + seededRand(parkCode, 800 + i) * 0.35} />
        ))}

        {/* Horizontal band dividers — skipped when a custom glyph fills the
            center, since an uploaded icon isn't drawn with a matching white
            gap and the lines would cut across it */}
        {!hasCustomGlyph && (
          <>
            <line x1="17" y1="34" x2="83" y2="34" stroke={c} strokeWidth="0.9" opacity="0.8" />
            <line x1="17" y1="66" x2="83" y2="66" stroke={c} strokeWidth="0.9" opacity="0.8" />
          </>
        )}

        {/* Park name on top arc — startOffset/textLength forced so a long
            name compresses to fit the arc instead of overflowing */}
        <text fill={c} fontWeight="800" fontSize={nameFontSize} letterSpacing={nameLetterSpacing} opacity="0.92">
          <textPath
            href={`#${topId}`}
            startOffset={nameStartOffset}
            textLength={nameTextLen}
            lengthAdjust="spacingAndGlyphs"
          >
            {shortName}
          </textPath>
        </text>

        {/* State code on bottom arc */}
        <text fill={c} fontWeight="700" fontSize="6.5" letterSpacing="1.8" opacity="0.88">
          <textPath
            href={`#${botId}`}
            startOffset={STATE_START_OFFSET}
            textLength={STATE_TEXT_LEN}
            lengthAdjust="spacingAndGlyphs"
          >
            ★ {sc} ★
          </textPath>
        </text>

        {/* Center scene */}
        {(() => {
          if (hasCustomGlyph && customGlyph) {
            return (
              <g transform={glyphTransform(customGlyph.viewBox)}>
                {customGlyph.paths.map((shape, i) => (
                  <path
                    key={i}
                    d={shape.d}
                    fill={shape.fill === "white" ? "white" : c}
                    opacity={shape.opacity ?? 1}
                  />
                ))}
              </g>
            );
          }
          const glyph = getParkGlyph(parkCode);
          if (glyph) {
            return glyph.map((shape, i) => (
              <path
                key={i}
                d={shape.d}
                fill={shape.fill === "white" ? "white" : c}
                opacity={shape.opacity ?? 1}
              />
            ));
          }
          return (
            <>
              <path d="M 18 63 L 36 44 L 54 63 Z" fill={c} opacity="0.38" />
              <path d="M 33 63 L 53 37 L 73 63 Z" fill={c} opacity="0.88" />
              <path d="M 53 37 L 47 48 L 59 48 Z" fill="white" opacity="0.28" />
              <path d="M 18 63 L 21 56 L 24 63 Z" fill={c} opacity="0.9" />
              <path d="M 23 63 L 27 55 L 31 63 Z" fill={c} opacity="0.9" />
              <path d="M 72 63 L 75 56 L 78 63 Z" fill={c} opacity="0.9" />
              <path d="M 77 63 L 80 55 L 83 63 Z" fill={c} opacity="0.88" />
              <circle cx="72" cy="43" r="2.8" fill={c} opacity="0.88" />
            </>
          );
        })()}
      </svg>
    </div>
  );
}
