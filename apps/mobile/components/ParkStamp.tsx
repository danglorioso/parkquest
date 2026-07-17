import { View } from 'react-native';
import Svg, {
  Circle, Defs, G, Line, Path as SvgPath, RadialGradient, Stop, Text as SvgText, TextPath,
} from 'react-native-svg';
import { getParkGlyph } from '@parkquest/types';

// ── Stamp palette + helpers ───────────────────────────────────────────────────

const STAMP_COLORS = ['#5A2418', '#1F3D2E', '#2D4F66', '#3A2E5C', '#7B3A1F'];

export function stampColor(idx: number): string {
  return STAMP_COLORS[idx % STAMP_COLORS.length];
}

// ── Ink-worn texture ─────────────────────────────────────────────────────────
// A vector stamp with perfectly uniform rings reads as a sticker, not ink on
// paper. These add the texture of an actual rubber-stamp impression — uneven
// pickup, speckle, a faint double-strike — without SVG filter primitives
// (feTurbulence etc. render inconsistently across react-native-svg's
// iOS/Android backends). Everything here is seeded off parkCode so a given
// park's stamp looks identical everywhere it appears, not re-randomized
// per mount.

function seededRand(seed: string, i: number): number {
  let h = 0;
  const s = `${seed}#${i}`;
  for (let k = 0; k < s.length; k++) h = (h * 31 + s.charCodeAt(k)) >>> 0;
  return (h % 10000) / 10000;
}

// Irregular dash/gap pairs around a ring's circumference — reads as ink
// worn thin in some stretches, pooled dark in others, instead of a
// machine-even stroke.
function distressedDasharray(seed: string, circumference: number, segments: number): string {
  const dashBase = (circumference / segments) * 0.72;
  const gapBase = (circumference / segments) * 0.28;
  const parts: string[] = [];
  for (let i = 0; i < segments; i++) {
    const dash = Math.max(0.5, dashBase * (0.5 + seededRand(seed, i * 2) * 1.1));
    const gap = Math.max(0.2, gapBase * (0.4 + seededRand(seed, i * 2 + 1) * 1.5));
    parts.push(dash.toFixed(2), gap.toFixed(2));
  }
  return parts.join(' ');
}

// Scattered ink specks in and around the ring band — the fine grain a rubber
// stamp leaves from uneven ink-pad contact.
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
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA',
  Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', Florida: 'FL', Georgia: 'GA',
  Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA',
  Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD',
  Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS',
  Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH',
  'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC',
  'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA',
  'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD',
  Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA',
  Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY',
};

export function stateCode(states: string): string {
  const first = states.split(',')[0]?.trim() ?? states;
  if (first.length <= 3) return first.toUpperCase();
  return STATE_ABBR[first] ?? first.slice(0, 2).toUpperCase();
}

// ── Stamp ─────────────────────────────────────────────────────────────────────

export function ParkStamp({
  parkCode, name, states, colorIdx, size = 96, rotated = true, idSuffix = '',
}: {
  parkCode: string;
  name: string;
  states: string;
  colorIdx: number;
  size?: number;
  rotated?: boolean;
  /** Keeps TextPath def ids unique when the same park renders on two mounted screens. */
  idSuffix?: string;
}) {
  const c         = stampColor(colorIdx);
  const sc        = stateCode(states);
  const raw       = name.toUpperCase();
  const shortName = raw.length > 18 ? raw.slice(0, 16) + '…' : raw;
  const nameFontSize = shortName.length > 16 ? 7 : shortName.length > 13 ? 7.5 : shortName.length > 10 ? 8 : 9;
  const rotate    = rotated ? `${((colorIdx * 37) % 16) - 8}deg` : '0deg';
  const topId     = `top-${parkCode}${idSuffix}`;
  const botId     = `bot-${parkCode}${idSuffix}`;
  const bleedId   = `bleed-${parkCode}${idSuffix}`;

  // Seed off parkCode alone (not idSuffix) — the same park's stamp should
  // look identical on every screen it appears, only the DOM ids need to
  // stay unique per mount.
  const outerDash = distressedDasharray(parkCode, 2 * Math.PI * 44, 26);
  const innerDash = distressedDasharray(`${parkCode}-inner`, 2 * Math.PI * 37, 20);
  const specks = inkSpecks(parkCode, 16);
  // A second, faint impression offset a fraction of a mm — the classic
  // tell of a hand-stamped mark that shifted slightly between the first
  // and second press.
  const ghostDx = (seededRand(parkCode, 900) - 0.5) * 1.6;
  const ghostDy = (seededRand(parkCode, 901) - 0.5) * 1.6;
  const ghostRotate = (seededRand(parkCode, 902) - 0.5) * 6;

  return (
    <View style={{ transform: [{ rotate }] }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <SvgPath id={topId} d="M 14 50 A 36 36 0 0 1 86 50" />
          <SvgPath id={botId} d="M 14 50 A 36 36 0 0 0 86 50" />
          <RadialGradient id={bleedId} cx="50%" cy="50%" r="50%">
            <Stop offset="70%" stopColor={c} stopOpacity="0" />
            <Stop offset="100%" stopColor={c} stopOpacity="0.16" />
          </RadialGradient>
        </Defs>

        {/* Ink-bleed halo — paper soaking up ink at the ring's edge */}
        <Circle cx="50" cy="50" r="48" fill={`url(#${bleedId})`} />

        {/* Faint double-strike ghost, offset — a hand stamp rarely lands twice
            in exactly the same spot */}
        <G transform={`translate(${ghostDx} ${ghostDy}) rotate(${ghostRotate} 50 50)`} opacity="0.14">
          <Circle cx="50" cy="50" r="44" fill="none" stroke={c} strokeWidth="3.5" />
          <Circle cx="50" cy="50" r="37" fill="none" stroke={c} strokeWidth="1.1" />
        </G>

        {/* Outer thick ring — matches real stamp border weight, dashed
            irregularly so the ink reads as worn rather than machine-even */}
        <Circle cx="50" cy="50" r="44" fill="none" stroke={c} strokeWidth="3.5" opacity="0.92" strokeDasharray={outerDash} />
        {/* Inner ring */}
        <Circle cx="50" cy="50" r="37" fill="none" stroke={c} strokeWidth="1.1" opacity="0.85" strokeDasharray={innerDash} />

        {/* Ink specks — the fine grain an ink pad leaves around the ring */}
        {specks.map((s, i) => (
          <Circle key={i} cx={s.x} cy={s.y} r={s.r} fill={c} opacity={s.op} />
        ))}

        {/* Tick marks between rings at 8 positions (cardinal + diagonal),
            each with a touch of seeded wear so they don't all match */}
        {([
          ['88.5', '50', '93', '50'], ['11.5', '50', '7', '50'],
          ['50', '88.5', '50', '93'], ['50', '11.5', '50', '7'],
          ['77.2', '77.2', '80.4', '80.4'], ['22.8', '77.2', '19.6', '80.4'],
          ['22.8', '22.8', '19.6', '19.6'], ['77.2', '22.8', '80.4', '19.6'],
        ] as const).map(([x1, y1, x2, y2], i) => (
          <Line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={c} strokeWidth="1.4" opacity={0.6 + seededRand(parkCode, 800 + i) * 0.35} />
        ))}

        {/* Horizontal band dividers — create 3-section stamp layout */}
        <Line x1="17"   y1="34"   x2="83"   y2="34"   stroke={c} strokeWidth="0.9" opacity="0.8" />
        <Line x1="17"   y1="66"   x2="83"   y2="66"   stroke={c} strokeWidth="0.9" opacity="0.8" />

        {/* Park name on top arc */}
        <SvgText fill={c} fontWeight="800" fontSize={nameFontSize} letterSpacing="1.5" opacity="0.92">
          <TextPath href={`#${topId}`} startOffset="50%" textAnchor="middle">
            {shortName}
          </TextPath>
        </SvgText>

        {/* State code on bottom arc */}
        <SvgText fill={c} fontWeight="700" fontSize="6.5" letterSpacing="1.8" opacity="0.88">
          <TextPath href={`#${botId}`} startOffset="50%" textAnchor="middle">
            ★ {sc} ★
          </TextPath>
        </SvgText>

        {/* Center scene ─────────────────────────────────────────── */}
        {(() => {
          const glyph = getParkGlyph(parkCode);
          if (glyph) {
            return glyph.map((shape, i) => (
              <SvgPath
                key={i}
                d={shape.d}
                fill={shape.fill === 'white' ? 'white' : c}
                opacity={shape.opacity ?? 1}
              />
            ));
          }
          // Default scene — used until a park gets a real illustrated glyph.
          return (
            <>
              {/* Back mountain (left, lighter for depth) */}
              <SvgPath d="M 18 63 L 36 44 L 54 63 Z" fill={c} opacity="0.38" />
              {/* Front mountain (center, taller) */}
              <SvgPath d="M 33 63 L 53 37 L 73 63 Z" fill={c} opacity="0.88" />
              {/* Snow cap on front peak */}
              <SvgPath d="M 53 37 L 47 48 L 59 48 Z" fill="white" opacity="0.28" />
              {/* Pine trees — left */}
              <SvgPath d="M 18 63 L 21 56 L 24 63 Z" fill={c} opacity="0.9" />
              <SvgPath d="M 23 63 L 27 55 L 31 63 Z" fill={c} opacity="0.9" />
              {/* Pine trees — right */}
              <SvgPath d="M 72 63 L 75 56 L 78 63 Z" fill={c} opacity="0.9" />
              <SvgPath d="M 77 63 L 80 55 L 83 63 Z" fill={c} opacity="0.88" />
              {/* Sun */}
              <Circle cx="72" cy="43" r="2.8" fill={c} opacity="0.88" />
            </>
          );
        })()}
      </Svg>
    </View>
  );
}
