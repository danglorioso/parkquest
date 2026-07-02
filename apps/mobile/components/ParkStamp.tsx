import { View } from 'react-native';
import Svg, { Circle, Defs, Line, Path as SvgPath, Text as SvgText, TextPath } from 'react-native-svg';

// ── Stamp palette + helpers ───────────────────────────────────────────────────

const STAMP_COLORS = ['#5A2418', '#1F3D2E', '#2D4F66', '#3A2E5C', '#7B3A1F'];

export function stampColor(idx: number): string {
  return STAMP_COLORS[idx % STAMP_COLORS.length];
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

  return (
    <View style={{ transform: [{ rotate }] }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <SvgPath id={topId} d="M 14 50 A 36 36 0 0 1 86 50" />
          <SvgPath id={botId} d="M 14 50 A 36 36 0 0 0 86 50" />
        </Defs>

        {/* Outer thick ring — matches real stamp border weight */}
        <Circle cx="50" cy="50" r="44" fill="none" stroke={c} strokeWidth="3.5" opacity="0.92" />
        {/* Inner ring */}
        <Circle cx="50" cy="50" r="37" fill="none" stroke={c} strokeWidth="1.1" opacity="0.85" />

        {/* Tick marks between rings at 8 positions (cardinal + diagonal) */}
        <Line x1="88.5" y1="50"   x2="93"   y2="50"   stroke={c} strokeWidth="1.4" opacity="0.85" />
        <Line x1="11.5" y1="50"   x2="7"    y2="50"   stroke={c} strokeWidth="1.4" opacity="0.85" />
        <Line x1="50"   y1="88.5" x2="50"   y2="93"   stroke={c} strokeWidth="1.4" opacity="0.85" />
        <Line x1="50"   y1="11.5" x2="50"   y2="7"    stroke={c} strokeWidth="1.4" opacity="0.85" />
        <Line x1="77.2" y1="77.2" x2="80.4" y2="80.4" stroke={c} strokeWidth="1.4" opacity="0.85" />
        <Line x1="22.8" y1="77.2" x2="19.6" y2="80.4" stroke={c} strokeWidth="1.4" opacity="0.85" />
        <Line x1="22.8" y1="22.8" x2="19.6" y2="19.6" stroke={c} strokeWidth="1.4" opacity="0.85" />
        <Line x1="77.2" y1="22.8" x2="80.4" y2="19.6" stroke={c} strokeWidth="1.4" opacity="0.85" />

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
      </Svg>
    </View>
  );
}
