import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Dimensions, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import Reanimated, {
  Easing, Extrapolation, FadeInDown, interpolate, runOnJS,
  useAnimatedStyle, useSharedValue, withSpring, withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, Pattern, Line, RadialGradient, Rect, Stop } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ParkStamp } from '@/components/ParkStamp';
import { StampDetailModal } from '@/components/StampDetailModal';
import {
  BadgeDetailModal, BadgePatch, type BadgeColorPair, type BadgeDetailData,
} from '@/components/BadgeDetailModal';
import { BadgeShareSheet } from '@/components/BadgeShareSheet';
import { GlassIconBg } from '@/components/GlassIconBg';
import { useColors } from '@/lib/palette';
import type { CustomStampGlyph } from '@parkquest/types';

// ── Constants ─────────────────────────────────────────────────────────────────

const GOLD        = '#F0C550';
const PAPER       = '#FAF3E0';
const PAPER_DARK  = '#1C1912';
const P_INK       = '#3A2E1C';
const P_INK_DARK  = '#E8DCC0';
const P_MUTE      = 'rgba(58,46,28,0.45)';
const P_MUTE_DARK = 'rgba(232,220,192,0.45)';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const CARD_RADIUS = 14;
// Settled cover height — comfortably taller than the identity/stats/MRZ
// block itself (~450-480pt including a bio) so it never clips content and
// still leaves a visible band of plain cover pattern beneath it, plus real
// room below for stamps + badges.
const HEADER_H = Math.round(SCREEN_H * 0.58);

const H_PAD = 16;
const CELL_GAP = 10;
const BADGE_CELL_W = (SCREEN_W - H_PAD * 2 - CELL_GAP * 2) / 3;
const STAMP_CELL_W = Math.floor((SCREEN_W - 32 - 16) / 3);
const STAMP_D = Math.min(88, STAMP_CELL_W - 8);
const ROWS_PER_PAGE = 4;

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Park {
  park_code: string;
  name: string;
  states: string;
  stamp_glyph: CustomStampGlyph | null;
  is_national_park: boolean;
}

interface StampItem {
  park_code: string;
  name: string;
  states: string;
  visited: boolean;
  visited_date: string | null;
  colorIdx: number;
  stamp_glyph: CustomStampGlyph | null;
}

interface BadgeSummary {
  id: string;
  name: string;
  emoji: string;
  tier: string;
  colors?: BadgeColorPair | null;
  earned: boolean;
  earned_at: string | null;
}

export interface PassportExpandRequest {
  /** Card's on-screen frame at the moment it was tapped (window coords) —
      the animation grows from here, and shrinks back to it on close. */
  originRect: { x: number; y: number; width: number; height: number };
  getToken: () => Promise<string | null>;
  /** Already loaded by the profile screen — reused so the header and MRZ
      render instantly with no refetch/loading flash. */
  rawVisits: any[];
  /** Full earned list (not the 5-item preview slice) — also already loaded
      by the profile screen, so the badges section needs no fetch of its own. */
  earnedBadges: BadgeSummary[];
  profile: {
    avatarUrl: string | null;
    name: string | null;
    username: string;
    joinDate: string | null;
    bio: string | null;
  };
  stats: {
    parksVisited: number;
    parksTotal: number;
    areasVisited: number;
    badgesEarned: number;
    friendCount: number;
  };
  mrzLine1: string;
  mrzLine2: string;
  isDark: boolean;
}

interface Props extends PassportExpandRequest {
  onClose: () => void;
}

// ── Cover pattern ─────────────────────────────────────────────────────────────
// Deliberately its own thing rather than the profile card's HolographicShine:
// that component's guilloche waves/seal are positioned as fractions of its
// own width/height, so a small (card-sized) and large (full-cover-sized)
// render are literally different geometry, not the same art zoomed out —
// revealing one via a growing clip window reads as the pattern itself
// morphing/stretching. An SVG <Pattern> tile is genuinely size-independent
// (userSpaceOnUse units repeat identically no matter how big the containing
// rect is), so a small and large render of THIS share pixel-identical
// geometry wherever they overlap — the growing box only ever uncovers more
// of the exact same fixed tile, never redraws it.
function CoverPattern({ w, h }: { w: number; h: number }) {
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <Pattern id="passportCoverGrid" patternUnits="userSpaceOnUse" width={46} height={46} patternTransform="rotate(30)">
          <Line x1={0} y1={0} x2={0} y2={46} stroke="rgba(201,169,74,0.11)" strokeWidth={1} />
          <Line x1={23} y1={0} x2={23} y2={46} stroke="rgba(201,169,74,0.05)" strokeWidth={1} />
        </Pattern>
        <RadialGradient id="passportCoverVig" cx="16%" cy="0%" r="90%">
          <Stop offset="0" stopColor="#fff8e6" stopOpacity={0.14} />
          <Stop offset="1" stopColor="#fff8e6" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="passportCoverShadow" cx="92%" cy="100%" r="80%">
          <Stop offset="0" stopColor="#000000" stopOpacity={0.22} />
          <Stop offset="1" stopColor="#000000" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill="url(#passportCoverGrid)" />
      <Rect x={0} y={0} width={w} height={h} fill="url(#passportCoverVig)" />
      <Rect x={0} y={0} width={w} height={h} fill="url(#passportCoverShadow)" />
    </Svg>
  );
}

// ── Stamp cell ────────────────────────────────────────────────────────────────

function StampCell({ item, onPress, dark }: { item: StampItem; onPress: () => void; dark: boolean }) {
  const ink = dark ? P_INK_DARK : P_INK;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75} style={st.stampCell}>
      <ParkStamp
        parkCode={item.park_code}
        name={item.name}
        states={item.states}
        colorIdx={item.colorIdx}
        size={STAMP_D}
        customGlyph={item.stamp_glyph}
        dark={dark}
      />
      <Text numberOfLines={2} style={[st.stampName, { color: ink }]}>{item.name}</Text>
    </TouchableOpacity>
  );
}

function StampPlaceholder({ item, dark }: { item: StampItem; dark: boolean }) {
  const ink = dark ? P_INK_DARK : P_INK;
  return (
    <View style={[st.stampCell, { opacity: 0.22 }]}>
      <View style={[st.placeholderCircle, { width: STAMP_D, height: STAMP_D, borderRadius: STAMP_D / 2, borderColor: ink }]}>
        <Ionicons name="add" size={18} color={ink} />
      </View>
      <Text numberOfLines={2} style={[st.stampName, { color: ink }]}>{item.name}</Text>
    </View>
  );
}

// ── Badge cell ────────────────────────────────────────────────────────────────

function BadgeCell({ badge, index, onPress }: { badge: BadgeSummary; index: number; onPress: () => void }) {
  return (
    <Reanimated.View
      entering={FadeInDown.delay(index * 45).duration(420).springify().damping(16)}
      style={{ width: BADGE_CELL_W }}
    >
      <TouchableOpacity onPress={onPress} activeOpacity={0.75} style={st.badgeCell}>
        <BadgePatch emoji={badge.emoji} tier={badge.tier} colors={badge.colors} size={64} earned />
        <Text numberOfLines={2} style={st.badgeCellName}>{badge.name}</Text>
      </TouchableOpacity>
    </Reanimated.View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export function PassportExpandView({
  originRect, getToken, rawVisits, earnedBadges, profile, stats, mrzLine1, mrzLine2, isDark, onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const T = useColors();
  const router = useRouter();
  const paper = isDark ? PAPER_DARK : PAPER;
  const ink   = isDark ? P_INK_DARK : P_INK;
  const mute  = isDark ? P_MUTE_DARK : P_MUTE;

  const [allParks, setAllParks] = useState<Park[]>([]);
  const [parksLoading, setParksLoading] = useState(true);
  const [showContent, setShowContent] = useState(false);
  const [selectedStamp, setSelectedStamp] = useState<StampItem | null>(null);
  const [selectedBadge, setSelectedBadge] = useState<BadgeSummary | null>(null);
  const [sharingBadge, setSharingBadge] = useState<BadgeSummary | null>(null);

  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  useEffect(() => {
    (async () => {
      const tok = await getTokenRef.current();
      if (!tok) { setParksLoading(false); return; }
      try {
        const res = await fetch(`${BASE}/api/parks`, { headers: { Authorization: `Bearer ${tok}` } });
        setAllParks(res.ok ? await res.json() : []);
      } catch (e) {
        console.error('Passport expand parks load:', e);
      } finally {
        setParksLoading(false);
      }
    })();
  }, []);

  const nationalParks = useMemo(() => allParks.filter(p => p.is_national_park), [allParks]);

  const allStampItems = useMemo((): StampItem[] => {
    const visitedMap = new Map<string, string>();
    rawVisits.forEach((v: any) => {
      if (!v.is_bucket_list && v.visited_date) visitedMap.set(v.park_code, v.visited_date);
    });
    const visited: StampItem[] = [];
    const unvisited: StampItem[] = [];
    nationalParks.forEach((p, idx) => {
      const date = visitedMap.get(p.park_code) ?? null;
      const entry: StampItem = {
        park_code: p.park_code, name: p.name, states: p.states,
        visited: !!date, visited_date: date, colorIdx: idx, stamp_glyph: p.stamp_glyph,
      };
      (date ? visited : unvisited).push(entry);
    });
    visited.sort((a, b) => (a.visited_date ?? '').localeCompare(b.visited_date ?? ''));
    return [...visited, ...unvisited];
  }, [nationalParks, rawVisits]);

  const stampRows = useMemo(() => {
    const rows: { key: string; items: StampItem[]; divider?: number }[] = [];
    for (let i = 0; i < allStampItems.length; i += 3) {
      const rowIdx = i / 3;
      rows.push({
        key: `row-${rowIdx}`,
        items: allStampItems.slice(i, i + 3),
        divider: rowIdx > 0 && rowIdx % ROWS_PER_PAGE === 0 ? Math.floor(rowIdx / ROWS_PER_PAGE) + 1 : undefined,
      });
    }
    return rows;
  }, [allStampItems]);

  // ── Animation choreography ──
  // Phase A (grow): card rect → full screen, edge to edge, a light haptic
  // marking the moment it "takes over" the screen. Phase B (settle): the
  // full-screen flash relaxes down into a fixed header, height only, while
  // stamps/badges reveal underneath. Both phases share one card→full→header
  // height timeline so there's never a visible seam between them.
  const growProgress   = useSharedValue(0);
  const settleProgress = useSharedValue(0);

  useEffect(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    growProgress.value = withSpring(1, { damping: 20, stiffness: 160, mass: 0.9 }, finished => {
      if (finished) {
        settleProgress.value = withTiming(1, { duration: 340, easing: Easing.out(Easing.cubic) });
        runOnJS(setShowContent)(true);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setShowContent(false);
    settleProgress.value = withTiming(0, { duration: 220, easing: Easing.in(Easing.cubic) }, finished => {
      if (finished) {
        growProgress.value = withTiming(0, { duration: 340, easing: Easing.in(Easing.cubic) }, done => {
          if (done) runOnJS(onClose)();
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  const heroStyle = useAnimatedStyle(() => {
    const g = growProgress.value;
    const s = settleProgress.value;
    const fullH = SCREEN_H + insets.top;
    const growH = interpolate(g, [0, 1], [originRect.height, fullH], Extrapolation.CLAMP);
    return {
      top: interpolate(g, [0, 1], [originRect.y, -insets.top], Extrapolation.CLAMP),
      left: interpolate(g, [0, 1], [originRect.x, 0], Extrapolation.CLAMP),
      width: interpolate(g, [0, 1], [originRect.width, SCREEN_W], Extrapolation.CLAMP),
      height: interpolate(s, [0, 1], [growH, HEADER_H + insets.top], Extrapolation.CLAMP),
      borderRadius: interpolate(g, [0, 1], [CARD_RADIUS, 0], Extrapolation.CLAMP),
    };
  });

  // The identity block's leading offset: matches the card's own ~20px
  // padding at t=0 (so nothing jumps the instant the overlay takes over),
  // and grows just enough to clear the status bar/notch once the cover has
  // pulled all the way up under it. A single smoothly-interpolated number
  // on a plain text block is cheap and reads as the card settling into
  // place — unlike animating the SVG pattern's own bounds, this is safe.
  const heroInnerStyle = useAnimatedStyle(() => ({
    paddingTop: interpolate(growProgress.value, [0, 1], [20, insets.top + 28], Extrapolation.CLAMP),
  }));

  const name = profile.name ?? 'Explorer';

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
      <StatusBar style="light" />

      {/* ── Cover — grows from the card's rect to fill the screen, then
          settles down to a fixed header height, bleeding edge-to-edge under
          the status bar the whole time. The pattern is mounted once, fixed
          at its own true size, pinned to the hero's own top-left corner —
          the hero's overflow:hidden bounds growing/shrinking just reveals
          more or less of that one fixed tile; it never moves or redraws.
          The content block below (avatar → MRZ) is intrinsically sized
          (never stretched to fill the box) so it's fully visible from the
          first frame — only its leading padding eases to clear the notch
          once the cover pulls up under it. */}
      <Reanimated.View style={[st.hero, heroStyle, { backgroundColor: T.primaryDeep }]}>
        <View style={{ position: 'absolute', top: 0, left: 0, width: SCREEN_W, height: SCREEN_H + insets.top }}>
          <CoverPattern w={SCREEN_W} h={SCREEN_H + insets.top} />
        </View>
        <Reanimated.View style={[st.heroInner, heroInnerStyle]}>
          <View style={st.avatarWrap}>
            {profile.avatarUrl ? (
              <Reanimated.Image source={{ uri: profile.avatarUrl }} style={st.avatarImg} />
            ) : (
              <Text style={st.avatarInitial}>{name[0]?.toUpperCase() ?? '?'}</Text>
            )}
          </View>
          <Text style={st.name} numberOfLines={1} adjustsFontSizeToFit>{name}</Text>
          {profile.username ? <Text style={st.handle}>@{profile.username}</Text> : null}
          {profile.joinDate ? <Text style={st.joined}>Joined {profile.joinDate}</Text> : null}

          {profile.bio ? <Text style={st.bio}>{profile.bio}</Text> : null}

          <View style={st.statsRow}>
            {([
              { label: 'NP VISITED', value: `${stats.parksVisited}/${stats.parksTotal}` },
              { label: 'NPS AREAS', value: String(stats.areasVisited) },
              { label: 'BADGES', value: String(stats.badgesEarned) },
              { label: stats.friendCount === 1 ? 'FRIEND' : 'FRIENDS', value: String(stats.friendCount) },
            ]).map(sItem => (
              <View key={sItem.label} style={st.statItem}>
                <Text style={st.statLabel}>{sItem.label}</Text>
                <Text style={st.statVal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{sItem.value}</Text>
              </View>
            ))}
          </View>

          <View style={st.progressWrap}>
            <Text style={st.progressText}>
              {stats.parksTotal > 0 ? `${stats.parksVisited} of ${stats.parksTotal} parks stamped` : 'No parks stamped yet'}
            </Text>
            <View style={st.progressTrack}>
              <View style={[st.progressFill, { width: `${stats.parksTotal > 0 ? (stats.parksVisited / stats.parksTotal) * 100 : 0}%` as `${number}%` }]} />
            </View>
          </View>

          <View style={st.footer}>
            <Text style={st.mrzText} numberOfLines={1}>{mrzLine1}</Text>
            <Text style={st.mrzText} numberOfLines={1}>{mrzLine2}</Text>
          </View>
        </Reanimated.View>
      </Reanimated.View>

      {/* ── Floating top bar — close / share only, no title. Always fully
          opaque (never wrapped in an animated-opacity ancestor) — a
          GlassView loses its real Liquid Glass material and silently falls
          back to a flat fill for as long as any ancestor sits below full
          opacity, so fading this in would have quietly broken the glass
          look these buttons are meant to match everywhere else in the app. ── */}
      <View style={[st.topBar, { top: insets.top + 4 }]} pointerEvents="box-none">
        <TouchableOpacity onPress={handleClose} hitSlop={8} style={st.topBarBtn}>
          <GlassIconBg onMedia fallbackColor="rgba(8,16,12,0.45)" />
          <Ionicons name="close" size={22} color={GOLD} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/passport-share' as never)} hitSlop={8} style={st.topBarBtn}>
          <GlassIconBg onMedia fallbackColor="rgba(8,16,12,0.45)" />
          <Ionicons name="share-outline" size={20} color={GOLD} />
        </TouchableOpacity>
      </View>

      {/* ── Stamps + badges — scrolls independently underneath the fixed
          cover, mounted only once the cover has settled so each row/badge's
          entrance animation plays as it "falls" into place rather than
          firing invisibly while the cover was still growing. ── */}
      {showContent && (
        <View style={[st.contentWrap, { top: HEADER_H, backgroundColor: paper }]}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
            <View style={st.sectionHead}>
              <Text style={[st.sectionKicker, { color: mute }]}>NATIONAL PARK STAMPS</Text>
              <Text style={[st.sectionTitle, { color: ink }]}>
                {stats.parksVisited} of {stats.parksTotal}
              </Text>
            </View>

            {parksLoading ? (
              <ActivityIndicator size="small" color={ink} style={{ marginTop: 24 }} />
            ) : stampRows.length === 0 ? (
              <Text style={[st.emptyText, { color: mute }]}>No parks to show yet.</Text>
            ) : (
              stampRows.map((row, ri) => (
                <View key={row.key}>
                  {row.divider != null && (
                    <View style={st.pageDivider}>
                      <View style={[st.pageDividerLine, { backgroundColor: GOLD + '55' }]} />
                      <Text style={[st.pageDividerText, { color: GOLD + 'AA' }]}>· {row.divider} ·</Text>
                      <View style={[st.pageDividerLine, { backgroundColor: GOLD + '55' }]} />
                    </View>
                  )}
                  <Reanimated.View
                    entering={FadeInDown.delay(Math.min(ri, 8) * 35).duration(360)}
                    style={st.stampRow}
                  >
                    {row.items.map(item => item.visited ? (
                      <StampCell key={item.park_code} item={item} dark={isDark} onPress={() => setSelectedStamp(item)} />
                    ) : (
                      <StampPlaceholder key={item.park_code} item={item} dark={isDark} />
                    ))}
                    {row.items.length < 3 && Array.from({ length: 3 - row.items.length }).map((_, i) => (
                      <View key={`pad-${i}`} style={{ width: STAMP_CELL_W }} />
                    ))}
                  </Reanimated.View>
                </View>
              ))
            )}

            <View style={[st.sectionHead, { marginTop: 8 }]}>
              <Text style={[st.sectionKicker, { color: mute }]}>ACHIEVEMENTS</Text>
              <Text style={[st.sectionTitle, { color: ink }]}>
                {earnedBadges.length} badge{earnedBadges.length !== 1 ? 's' : ''} earned
              </Text>
            </View>

            {earnedBadges.length === 0 ? (
              <Text style={[st.emptyText, { color: mute }]}>Explore parks to start earning badges.</Text>
            ) : (
              <View style={st.badgeGrid}>
                {earnedBadges.map((b, i) => (
                  <BadgeCell key={b.id} badge={b} index={i} onPress={() => setSelectedBadge(b)} />
                ))}
              </View>
            )}
            <TouchableOpacity
              onPress={() => router.push('/profile/badges' as never)}
              activeOpacity={0.7}
              style={st.seeAllBtn}
            >
              <Text style={[st.seeAllText, { color: T.primary }]}>See full badge collection</Text>
              <Ionicons name="chevron-forward" size={15} color={T.primary} />
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      {selectedStamp && (
        <StampDetailModal
          stamp={selectedStamp}
          onClose={() => setSelectedStamp(null)}
          onViewVisits={s => {
            setSelectedStamp(null);
            handleClose();
            router.push({ pathname: '/profile/journal', params: { parkCode: s.park_code, parkName: s.name } } as never);
          }}
          onParkInfo={s => {
            setSelectedStamp(null);
            handleClose();
            router.push(`/park/${s.park_code}` as never);
          }}
        />
      )}

      {selectedBadge && (
        <BadgeDetailModal
          badge={selectedBadge as BadgeDetailData}
          onClose={() => setSelectedBadge(null)}
          onShare={() => { setSharingBadge(selectedBadge); setSelectedBadge(null); }}
        />
      )}
      {sharingBadge && (
        <BadgeShareSheet badge={sharingBadge} onClose={() => setSharingBadge(null)} />
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  hero: {
    position: 'absolute',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 1,
  },
  heroInner: {
    // Fixed, never animated: this block's height is whatever its content
    // needs (comfortably less than the card's own real height), pinned to
    // the top of the hero box. It never stretches to fill the box — the
    // box growing just exposes more plain cover beneath it.
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 16,
  },
  avatarWrap: {
    width: 84, height: 84, borderRadius: 42,
    borderWidth: 2, borderColor: GOLD + '66',
    alignSelf: 'center',
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarInitial: { fontSize: 30, fontWeight: '900', color: GOLD },
  name: {
    marginTop: 12, fontSize: 26, fontWeight: '800', color: GOLD, textAlign: 'center', letterSpacing: -0.4,
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
  handle: { fontSize: 13, fontWeight: '600', color: 'rgba(201,169,74,0.85)', letterSpacing: 0.6, marginTop: 3, textAlign: 'center' },
  joined: { fontSize: 13, color: 'rgba(201,169,74,0.75)', marginTop: 6, textAlign: 'center' },
  bio: { fontSize: 13.5, color: 'rgba(255,251,241,0.8)', textAlign: 'center', marginTop: 12, lineHeight: 19 },
  // Same 2×2 wrap as the profile card's own stat grid — reusing it exactly
  // (rather than a single row of 4) means this block's layout never differs
  // from what's already on screen the instant the card is tapped.
  statsRow: {
    flexDirection: 'row', flexWrap: 'wrap', marginTop: 16, paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(240,197,80,0.22)',
  },
  statItem: { width: '50%', alignItems: 'center', marginBottom: 12 },
  statLabel: { fontSize: 11, fontWeight: '700', color: GOLD, letterSpacing: 1.4, opacity: 0.8, marginBottom: 4 },
  statVal: {
    fontSize: 24, fontWeight: '800', color: GOLD, letterSpacing: -0.4,
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },
  progressWrap: { marginTop: 6, gap: 8 },
  progressText: { fontSize: 12, fontWeight: '600', color: GOLD, opacity: 0.8, letterSpacing: 0.4 },
  progressTrack: { height: 3, backgroundColor: GOLD + '22', borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 3, backgroundColor: GOLD, borderRadius: 2, opacity: 0.9 },
  footer: {
    marginTop: 14, paddingTop: 12,
    borderTopWidth: 0.5, borderTopColor: 'rgba(201,169,74,0.18)',
  },
  mrzText: {
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: 10, color: 'rgba(201,169,74,0.4)', letterSpacing: 1.5, lineHeight: 15,
  },

  topBar: {
    position: 'absolute', left: 12, right: 12, zIndex: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  topBarBtn: {
    width: 44, height: 44, borderRadius: 22, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },

  contentWrap: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  sectionHead: { paddingHorizontal: H_PAD, paddingTop: 22, paddingBottom: 10 },
  sectionKicker: { fontSize: 11, fontWeight: '700', letterSpacing: 1.6 },
  sectionTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, marginTop: 3 },
  emptyText: { fontSize: 13, textAlign: 'center', marginTop: 16, paddingHorizontal: 32 },

  stampRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8 },
  stampCell: { width: STAMP_CELL_W, alignItems: 'center', paddingVertical: 14 },
  stampName: { fontSize: 11, fontWeight: '600', textAlign: 'center', marginTop: 6, lineHeight: 14, maxWidth: STAMP_CELL_W - 8 },
  placeholderCircle: { borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },

  pageDivider: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, gap: 10 },
  pageDividerLine: { flex: 1, height: 0.5 },
  pageDividerText: { fontSize: 10, fontWeight: '700', letterSpacing: 2 },

  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: H_PAD, gap: CELL_GAP },
  badgeCell: { alignItems: 'center', gap: 6, paddingVertical: 6 },
  badgeCellName: { fontSize: 12, fontWeight: '600', textAlign: 'center', color: '#8A7A54' },
  seeAllBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    marginTop: 18, marginBottom: 8, paddingVertical: 10,
  },
  seeAllText: { fontSize: 14, fontWeight: '700' },
});
