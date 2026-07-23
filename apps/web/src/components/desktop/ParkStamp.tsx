"use client";

import { getParkGlyph, glyphTransform, type CustomStampGlyph } from "@parkquest/types";

// ── Stamp palette + helpers ───────────────────────────────────────────────────
// Ported from apps/mobile/components/ParkStamp.tsx — same seeded ink-worn
// texture and arc-text layout, translated from react-native-svg to plain SVG
// (the two share almost identical prop names).

const STAMP_COLORS = ["#5A2418", "#1F3D2E", "#2D4F66", "#3A2E5C", "#7B3A1F"];

const TEXT_ARC_R = 33; // matches the topId/botId path radius below
const TEXT_ARC_LEN = Math.PI * TEXT_ARC_R; // semicircle (180° sweep)
const STATE_TEXT_LEN = 44; // forced glyph width for "★ XX ★" at fontSize 6.5
const STATE_START_OFFSET = `${(((TEXT_ARC_LEN - STATE_TEXT_LEN) / 2 / TEXT_ARC_LEN) * 100).toFixed(2)}%`;

export function stampColor(idx: number): string {
  return STAMP_COLORS[idx % STAMP_COLORS.length];
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
  parkCode, name, states, colorIdx, size = 96, rotated = true, idSuffix = "", inkColor, customGlyph,
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
}) {
  const c = inkColor ?? stampColor(colorIdx);
  const sc = stateCode(states);
  const raw = name.toUpperCase().replace(/NATIONAL PARK/g, "").replace(/\s+/g, " ").trim();
  const shortName = raw.length > 18 ? raw.slice(0, 16) + "…" : raw;
  const nameFontSize = shortName.length > 16 ? 7 : shortName.length > 13 ? 7.5 : shortName.length > 10 ? 8 : 9;
  const rotate = rotated ? `${((colorIdx * 37) % 16) - 8}deg` : "0deg";
  const topId = `top-${parkCode}${idSuffix}`;
  const botId = `bot-${parkCode}${idSuffix}`;
  const bleedId = `bleed-${parkCode}${idSuffix}`;

  const specks = inkSpecks(parkCode, 16);
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

        {/* Outer ring, doubled */}
        <circle cx="50" cy="50" r="44" fill="none" stroke={c} strokeWidth="3.5" opacity="0.92" />
        <circle cx="50" cy="50" r="40.5" fill="none" stroke={c} strokeWidth="1" opacity="0.75" />

        {/* Ink specks */}
        {specks.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill={c} opacity={s.op} />
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
        {!customGlyph && (
          <>
            <line x1="17" y1="34" x2="83" y2="34" stroke={c} strokeWidth="0.9" opacity="0.8" />
            <line x1="17" y1="66" x2="83" y2="66" stroke={c} strokeWidth="0.9" opacity="0.8" />
          </>
        )}

        {/* Park name on top arc */}
        <text fill={c} fontWeight="800" fontSize={nameFontSize} letterSpacing="1.5" opacity="0.92" textAnchor="middle">
          <textPath href={`#${topId}`} startOffset="50%" textAnchor="middle">
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
          if (customGlyph) {
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
