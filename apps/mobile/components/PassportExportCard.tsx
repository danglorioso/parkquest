import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HolographicShine } from '@/components/HolographicShine';
import { ParkStamp } from '@/components/ParkStamp';
import { stampDateStr } from '@/lib/passport';
import { useColors } from '@/lib/palette';
import type { CustomStampGlyph } from '@parkquest/types';

// The image version of the passport — what actually gets captured and
// shared/saved from the pre-share screen. Rendered at a fixed design width
// (EXPORT_W pt) so captureRef's device-pixel-ratio scaling yields a crisp
// ~1080px-wide export on 3x devices. Two aspect variants: 'square' (4:5,
// feed/messages) and 'story' (9:16, IG stories).

export const EXPORT_W = 360;
export const EXPORT_H: Record<ExportVariant, number> = {
  // Taller than a plain 4:5 (was 450) — the pre-share screen fits this card
  // into the space between its top bar and destination row, and at 450 that
  // left a lot of dead green above/below on most phones. Grown along with
  // the internal spacing/type below so the extra height reads as a more
  // generously laid-out card, not just a bigger blank flex spacer.
  square: 520,
  story:  640,
};

const GOLD = '#F0C550';

export type ExportVariant = 'square' | 'story';

export interface ExportStamp {
  park_code: string;
  name: string;
  states: string;
  colorIdx: number;
  stamp_glyph: CustomStampGlyph | null;
  visited_date: string | null;
}

export interface PassportExportData {
  name: string;
  username: string;
  avatarUrl: string | null;
  joinDate: string | null;
  visitedCount: number;
  totalParks: number;
  tripsCount: number;
  statesCount: number;
  totalParkStates: number;
  badgeCount: number;
  totalBadges: number;
  passportNo: string;
  mrzLine1: string;
  mrzLine2: string;
  firstStamp: ExportStamp | null;
  latestStamp: ExportStamp | null;
}

export function PassportExportCard({ data, variant }: { data: PassportExportData; variant: ExportVariant }) {
  const T = useColors();
  const story = variant === 'story';
  const H = EXPORT_H[variant];

  // Trimmed to three secondary stats — visitedCount now gets its own hero
  // line below (mirrors the passport screen's own "N of 63 parks stamped"
  // treatment) instead of being buried as a fourth small number here.
  // Matches the full passport screen's stat plate: bare counts except
  // STATES, whose "/total" is real information (not all 50 US states have
  // a park) but rendered small so it doesn't fight the headline number.
  const stats = [
    { label: 'TRIPS',  value: String(data.tripsCount) },
    { label: 'STATES', value: String(data.statesCount), sub: `/${data.totalParkStates}` },
    { label: 'BADGES', value: String(data.badgeCount) },
  ];

  const chips = [
    ...(data.firstStamp  ? [{ label: 'FIRST STAMP',  s: data.firstStamp }]  : []),
    ...(data.latestStamp ? [{ label: 'LATEST STAMP', s: data.latestStamp }] : []),
  ];

  return (
    <View style={[st.card, { width: EXPORT_W, height: H, backgroundColor: T.primaryDeep }]}>
      <HolographicShine
        staticSize={{ w: EXPORT_W, h: H }}
        lineIntensity={0.05}
        wavesAboveSeal
        staticShimmer
      />

      {/* Kicker — same edge-to-edge printed-document strip as the cover */}
      <Text style={st.kicker} numberOfLines={1} ellipsizeMode="clip">
        OFFICIAL RECORD OF VISITATION · AMERICA'S 63 NATIONAL PARKS · PARKQUEST.ME
      </Text>

      {/* Identity */}
      <View style={[st.identity, story && { marginTop: 26 }]}>
        <View style={[st.avatar, { backgroundColor: T.primary }]}>
          {data.avatarUrl ? (
            // Slight overscale — some avatar sources inset their graphic from
            // the image edges (see passport cover for the same trick).
            <Image
              source={{ uri: data.avatarUrl }}
              style={{ width: '100%', height: '100%', transform: [{ scale: 1.15 }] }}
              resizeMode="cover"
            />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              {data.name ? (
                <Text style={{ fontSize: 24, fontWeight: '900', color: GOLD }}>{data.name.slice(0, 2).toUpperCase()}</Text>
              ) : (
                <Ionicons name="person" size={24} color={GOLD} style={{ opacity: 0.5 }} />
              )}
            </View>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={st.name} numberOfLines={1} adjustsFontSizeToFit>{data.name}</Text>
          {data.username ? <Text style={st.handle}>@{data.username}</Text> : null}
          {data.joinDate ? <Text style={st.joined}>Joined {data.joinDate}</Text> : null}
        </View>
      </View>

      {/* Security-microprint band — document number + bearer name, not a
          plain park-name list (matches the full passport screen's cover). */}
      <Text style={st.watermark} numberOfLines={1} ellipsizeMode="clip">
        {(`${data.passportNo} ✦ ${(data.username || data.name).toUpperCase()} ✦ NATIONAL PARK PASSPORT ✦ `).repeat(6)}
      </Text>

      {/* Hero line — the one number that matters most, same wording as the
          full passport screen's own progress row */}
      <View style={st.hero}>
        <Text style={st.heroText} numberOfLines={1}>{data.visitedCount} of {data.totalParks} parks stamped</Text>
        <View style={st.progressTrack}>
          <View style={[st.progressFill, { width: `${data.totalParks > 0 ? (data.visitedCount / data.totalParks) * 100 : 0}%` as `${number}%` }]} />
        </View>
      </View>

      {/* Secondary stats plate */}
      <View style={st.statsPlate}>
        <View style={st.statsRow}>
          {stats.map((s, i) => (
            <View key={s.label} style={[st.stat, i > 0 && st.statBorder]}>
              <Text style={st.statLabel}>{s.label}</Text>
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                <Text style={st.statVal}>{s.value}</Text>
                {s.sub ? <Text style={st.statSub}>{s.sub}</Text> : null}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* First/latest stamps — story has room for full chips; square fits
          them smaller. Rendered only when the user has stamps at all. */}
      {chips.length > 0 && (
        <View style={[st.chipRow, story && { marginTop: 18 }]}>
          {chips.map(({ label, s }) => (
            <View key={label} style={st.chip}>
              <Text style={st.chipLabel}>{label}</Text>
              <ParkStamp
                parkCode={s.park_code}
                name={s.name}
                states={s.states}
                colorIdx={s.colorIdx}
                size={story ? 96 : 82}
                idSuffix={`-export-${variant}`}
                inkColor={GOLD}
                customGlyph={s.stamp_glyph}
              />
              {s.visited_date ? <Text style={st.chipDate}>{stampDateStr(s.visited_date)}</Text> : null}
            </View>
          ))}
        </View>
      )}

      {/* Bottom block pinned by the spacer above it */}
      <View style={{ flex: 1 }} />
      <View style={st.footer}>
        <Text style={st.corner}>NO · {data.passportNo}</Text>
        {/* Explicit, legible brand mark — not just the faint kicker/microprint,
            since this image gets viewed by people outside the app entirely. */}
        <Text style={st.brand}>parkquest.me</Text>
      </View>
      <View style={st.mrzStrip}>
        <Text style={st.mrzText} numberOfLines={1}>{data.mrzLine1}</Text>
        <Text style={st.mrzText} numberOfLines={1}>{data.mrzLine2}</Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  card: {
    overflow: 'hidden',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 14,
  },
  kicker: {
    marginHorizontal: -20,   // bleed edge-to-edge like the cover's strip
    fontSize: 10,
    fontWeight: '700',
    color: GOLD,
    letterSpacing: 1.8,
    opacity: 0.45,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 22,
  },
  avatar: {
    width: 66,
    height: 66,
    borderRadius: 33,
    borderWidth: 2,
    borderColor: GOLD + '66',
    overflow: 'hidden',
    flexShrink: 0,
  },
  name: {
    fontSize: 24,
    fontWeight: '800',
    color: GOLD,
    letterSpacing: -0.4,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  handle: {
    fontSize: 14,
    fontWeight: '600',
    color: GOLD,
    opacity: 0.75,
    letterSpacing: 0.4,
    marginTop: 3,
  },
  joined: {
    fontSize: 12,
    fontWeight: '500',
    color: GOLD,
    opacity: 0.6,
    letterSpacing: 0.3,
    marginTop: 3,
  },
  watermark: {
    marginHorizontal: -20,
    marginTop: 18,
    marginBottom: 18,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.6,
    color: 'rgba(201,169,74,0.22)',
  },
  hero: {
    gap: 8,
    marginBottom: 16,
  },
  heroText: {
    fontSize: 17,
    fontWeight: '800',
    color: GOLD,
    letterSpacing: -0.2,
  },
  statsPlate: {
    backgroundColor: 'rgba(8,16,12,0.42)',
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  statsRow: {
    flexDirection: 'row',
    paddingVertical: 14,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statBorder: {
    borderLeftWidth: 0.5,
    borderLeftColor: 'rgba(201,169,74,0.3)',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: GOLD,
    letterSpacing: 1.5,
    opacity: 0.85,
  },
  statVal: {
    fontSize: 25,
    fontWeight: '800',
    color: GOLD,
    letterSpacing: -0.5,
    marginTop: 3,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  statSub: {
    fontSize: 13,
    fontWeight: '700',
    color: GOLD,
    opacity: 0.55,
    letterSpacing: -0.2,
  },
  progressTrack: {
    height: 4,
    backgroundColor: GOLD + '22',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: 3,
    backgroundColor: GOLD,
    borderRadius: 2,
    opacity: 0.9,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  chip: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  chipLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: GOLD,
    opacity: 0.75,
    letterSpacing: 1.5,
  },
  chipDate: {
    fontSize: 10,
    color: GOLD,
    opacity: 0.65,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  corner: {
    fontSize: 10,
    fontWeight: '600',
    color: GOLD,
    letterSpacing: 1.1,
    opacity: 0.65,
  },
  brand: {
    fontSize: 13,
    fontWeight: '800',
    color: GOLD,
    letterSpacing: 0.2,
    opacity: 0.95,
  },
  mrzStrip: {
    paddingTop: 10,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(201,169,74,0.15)',
  },
  mrzText: {
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: 8,
    color: 'rgba(201,169,74,0.35)',
    letterSpacing: 1.5,
    lineHeight: 12,
  },
});
