import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Dimensions, Easing, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
  type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import Reanimated, { FadeInDown, FadeInUp, runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { HolographicShine } from '@/components/HolographicShine';
import { PassportFace, type PassportFaceStatItem, type PassportStatsRect } from '@/components/PassportFace';
import { GrowTouchable } from '@/components/GrowTouchable';
import { Avatar } from '@/components/Avatar';
import { ParkStamp } from '@/components/ParkStamp';
import { StampDetailModal } from '@/components/StampDetailModal';
import {
  BadgeDetailModal, BadgePatch, type BadgeColorPair, type BadgeDetailData,
} from '@/components/BadgeDetailModal';
import { BadgeShareSheet } from '@/components/BadgeShareSheet';
import { GlassIconBg } from '@/components/GlassIconBg';
import { useColors } from '@/lib/palette';
import type { CustomStampGlyph } from '@parkquest/types';

// The full passport — cover + national-park stamp grid + earned-badges grid
// — and the ONLY place the passport cover (pattern + PassportFace) is
// rendered at all. It lives permanently behind the profile screen's own
// content (app/(tabs)/profile/index.tsx), mounted once and never torn down
// or resized. The profile screen does not draw a passport card of its own:
// its "card" is a transparent, rounded hole cut out of the page, through
// which this layer's cover shows — so what you see in the card at rest and
// what you see on the open passport are literally the same pixels, not two
// copies kept in sync. The cover's card block (`st.cardBlock`) is
// positioned at exactly that hole's rect, and the whole layer tracks the
// profile's scroll offset (`shiftY`) while closed so the hole and the
// block never drift apart.
//
// "Opening" is the profile screen's own job: it scales its foreground
// (the hole's frame and everything around it) up and off past the screen
// edges, so the hole simply grows — uncovering more of this unchanging
// layer, the pattern continuing outward from what the card already
// showed, rather than this layer animating itself into existence. Every
// earlier attempt at animating THIS layer's own bounds, or at keeping a
// second card-sized copy of the cover visually in sync with this one,
// visibly glitched (pattern stretch, stat grid jumps, a duplicate avatar
// bleeding through the top bar's blur). Nothing here ever needs to animate
// its own frame, and nothing else ever draws the cover.
//
// ── The scroll-collapse header, take two ──────────────────────────────────
// The first version tried to make ONE set of elements (avatar, bio, the
// 2×2 stat grid) physically reflow into a compact header as the user
// scrolled — animating height, padding and font size on the JS thread
// (React Native's `Animated` can't run layout-affecting properties on the
// native thread at all), triggered by a hand-rolled scroll-position state
// machine. Every layer of that turned out fragile: the JS-thread animation
// was inherently janky under any load, and the state machine had a real
// bug (a native-driven scroll handler that got silently re-registered
// mid-session) that left it stuck or flashing.
//
// This version doesn't reflow anything. The cover is ORDINARY scrolling
// content — it has no pin, no collapsing height, nothing tracks scroll
// position at all for its own layout. It simply scrolls away like anything
// else when the user scrolls down. A completely separate, always-mounted
// CompactBar overlay sits fixed at the top of the screen, invisible until
// the cover has scrolled substantially out of view, then crossfades in —
// driven by ONE Animated.Value, ONE property (opacity), fully native-
// driven, with no layout properties involved anywhere. There is no shared
// animation between "expanded" and "collapsed" states to keep in sync;
// they're two independent, statically-laid-out views that happen to
// crossfade. That's what makes this version actually smooth: the native
// thread owns the entire transition once it starts, and the JS thread's
// only job is a cheap threshold comparison on each scroll event.

const GOLD        = '#F0C550';
const PAPER       = '#FAF3E0';
const PAPER_DARK  = '#1C1912';
const P_INK       = '#3A2E1C';
const P_INK_DARK  = '#E8DCC0';
const P_MUTE      = 'rgba(58,46,28,0.45)';
const P_MUTE_DARK = 'rgba(232,220,192,0.45)';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Geometry of the cover's card block — shared with the profile screen,
// which cuts its hole to exactly this rect. Keep these the single source of
// truth for both sides.
/** Horizontal inset of the card block (and hole) from the screen edges. */
export const PASSPORT_CARD_INSET = 16;
/** Corner radius of the hole the profile screen cuts. */
export const PASSPORT_CARD_RADIUS = 14;
/** Rendered width of the card block (and hole). */
export const PASSPORT_CARD_W = SCREEN_W - PASSPORT_CARD_INSET * 2;
// Must equal PassportFace's own hardcoded PADDING_H — it subtracts that from
// containerWidth internally to size its stat grid, so the block's real
// padding and the containerWidth it's handed have to agree with it.
const CARD_PAD_H = 20;
const CARD_PAD_V = 18;
// Gap between the card block's bottom and the stamps sheet below it.
const CARD_GAP_BELOW = 20;

// Fixed pattern geometry — never changes, so the pattern never stretches.
// Tall enough to cover the hero at its resting height on any device
// (hole top + a bio-heavy card + gap), with overflow clipping absorbing the
// rest; the pattern tiles horizontally, so a taller size just shows more of
// it, not a rescaled version.
const PATTERN_H = Math.round(SCREEN_H * 0.85);

const H_PAD = 16;
const CELL_GAP = 10;
const BADGE_CELL_W = (SCREEN_W - H_PAD * 2 - CELL_GAP * 2) / 3;
const STAMP_CELL_W = Math.floor((SCREEN_W - 32 - 16) / 3);
const STAMP_D = Math.min(88, STAMP_CELL_W - 8);
const ROWS_PER_PAGE = 4;

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

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

export interface PassportBackdropProps {
  /** Gates pointer events only — while closed, the profile screen's own
      foreground owns every touch (its hole has a tap target that opens the
      passport); once open, touches fall through the by-then-cleared
      foreground to this layer. Never affects what's rendered. */
  active: boolean;
  onRequestClose: () => void;
  /** Screen-absolute Y of the top of the hole the profile screen cuts (at
      scroll offset 0). The cover's card block is positioned at exactly this
      Y (plus PASSPORT_CARD_INSET from the left, PASSPORT_CARD_W wide). */
  holeTop: number;
  /** translateY applied to this whole layer — the profile screen drives it
      to -scrollY while closed so the block stays glued to the hole as the
      profile scrolls, and to 0 once open. */
  shiftY: Animated.AnimatedNode;
  /** Reports the card block's rendered height so the profile screen can
      size its hole to match. */
  onCardHeight: (h: number) => void;
  onAvatarPress: () => void;
  /** Reports the cover's 2×2 stat grid rect (relative to the card block =
      the hole) so the profile screen can float its own tap targets over the
      stats while the passport is closed — its hole tap target otherwise
      swallows every touch on the card (see PASSPORT_STAT_LINKS). The cover
      never collapses now, so unlike before this fires whenever the grid's
      own layout genuinely changes (e.g. bio length) — there's no
      "collapsed" variant of it to filter out. */
  onStatsLayout?: (rect: PassportStatsRect) => void;
  getToken: () => Promise<string | null>;
  rawVisits: any[];
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
  /** Per-fetch flags from the profile screen — stats show "–" (not 0)
      until their own data has actually arrived. */
  badgesLoaded: boolean;
  friendsLoaded: boolean;
  mrzLine1: string;
  mrzLine2: string;
  isDark: boolean;
}

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

/** Where each stat leads, shared by the expanded grid and the compact bar's
    row (in the same NP VISITED / NPS AREAS / BADGES / FRIENDS order). null =
    inert — on the closed card the tap falls through to the hole and opens
    the passport; on the open cover there's nothing more useful to link to
    (the stamps grid is right underneath). Shared with the profile screen so
    the closed card's own floating tap targets land on the same places. */
export const PASSPORT_STAT_LINKS: readonly (string | null)[] = [null, null, '/profile/badges', '/profile/friends'];

/** The compact bar's own stat row — independent from PassportFace's grid,
    not a collapsed version of it. Plain, static layout; nothing here
    animates except the bar's own opacity (handled by its parent). */
function CompactStats({ stats, badgesLoaded, friendsLoaded, onPress }: {
  stats: PassportBackdropProps['stats'];
  badgesLoaded: boolean;
  friendsLoaded: boolean;
  onPress: (href: string) => void;
}) {
  const items = [
    { label: 'NP VISITED', value: badgesLoaded ? `${stats.parksVisited}/${stats.parksTotal}` : '–', href: PASSPORT_STAT_LINKS[0] },
    { label: 'NPS AREAS', value: badgesLoaded ? String(stats.areasVisited) : '–', href: PASSPORT_STAT_LINKS[1] },
    { label: 'BADGES', value: badgesLoaded ? String(stats.badgesEarned) : '–', href: PASSPORT_STAT_LINKS[2] },
    { label: stats.friendCount === 1 ? 'FRIEND' : 'FRIENDS', value: friendsLoaded ? String(stats.friendCount) : '–', href: PASSPORT_STAT_LINKS[3] },
  ];
  return (
    <View style={st.compactStatsRow}>
      {items.map(it => {
        const body = (
          <View style={st.compactStat}>
            <Text style={st.compactStatValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{it.value}</Text>
            <Text style={st.compactStatLabel} numberOfLines={1}>{it.label}</Text>
          </View>
        );
        return it.href ? (
          <TouchableOpacity key={it.label} style={st.compactStatTap} onPress={() => onPress(it.href!)} hitSlop={4} activeOpacity={0.6}>
            {body}
          </TouchableOpacity>
        ) : <View key={it.label} style={st.compactStatTap}>{body}</View>;
      })}
    </View>
  );
}

export function PassportBackdrop({
  active, onRequestClose, holeTop, shiftY, onCardHeight, onAvatarPress, onStatsLayout,
  getToken, rawVisits, earnedBadges, profile, stats, badgesLoaded, friendsLoaded, mrzLine1, mrzLine2, isDark,
}: PassportBackdropProps) {
  const insets = useSafeAreaInsets();
  const T = useColors();
  const router = useRouter();
  const paper = isDark ? PAPER_DARK : PAPER;
  const ink   = isDark ? P_INK_DARK : P_INK;
  const mute  = isDark ? P_MUTE_DARK : P_MUTE;

  const [allParks, setAllParks] = useState<Park[]>([]);
  const [parksLoading, setParksLoading] = useState(true);
  const [selectedStamp, setSelectedStamp] = useState<StampItem | null>(null);
  const [selectedBadge, setSelectedBadge] = useState<BadgeSummary | null>(null);
  const [sharingBadge, setSharingBadge] = useState<BadgeSummary | null>(null);
  const [cardH, setCardH] = useState(0);

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
        console.error('Passport backdrop parks load:', e);
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

  // ── Cover geometry ── The hero starts at -insets.top (screen-absolute 0
  // is insets.top into it), so the card block's local top is
  // holeTop + insets.top — a plain spacer view achieves that offset; no
  // absolute positioning needed since the cover is ordinary flow content
  // now. The hero's own height is never set explicitly — it's just
  // whatever its children (the spacer + card block + gap) add up to.
  const blockTopRest = holeTop + insets.top;
  // For the compact-bar threshold only (see below) and the pattern's edge
  // lockup sizing — NOT used to size anything anymore.
  const heroH = blockTopRest + cardH + CARD_GAP_BELOW;

  const scrollRef = useRef<ScrollView>(null);

  // ── Compact bar crossfade ── A single native-driven opacity value, shown
  // once the cover has scrolled substantially out of view and hidden again
  // once scrolled back near the top. Two thresholds with a gap between them
  // (not one) so ordinary finger wobble near a single crossing point can't
  // retrigger it back and forth. `compactVisible` (plain React state, not
  // animated) gates pointerEvents — shown the instant the fade-in starts,
  // but only hidden once the fade-out has actually finished, so the bar's
  // tap targets never intercept a touch while invisible mid-fade, but also
  // never go dead half-visible.
  const compactAnim = useRef(new Animated.Value(0)).current;
  const compactShownRef = useRef(false);
  const [compactVisible, setCompactVisible] = useState(false);
  const thresholdsRef = useRef({ on: heroH * 0.55, off: heroH * 0.35 });
  thresholdsRef.current = { on: heroH * 0.55, off: heroH * 0.35 };

  const onRequestCloseRef = useRef(onRequestClose);
  onRequestCloseRef.current = onRequestClose;
  // Every close goes through here: the list scrolls back to the top so the
  // cover (not whatever's scrolled to) is what's glued to the profile's
  // hole by the time the close animation lands.
  const requestClose = useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    onRequestCloseRef.current();
  }, []);

  // How far past the top a pull has to go before it dismisses — as small
  // as tolerable. This fires LIVE, mid-drag (inside the same scroll
  // listener that drives the compact bar below), not on release: waiting
  // for onScrollEndDrag meant the user had to pull however far AND let go
  // before anything happened, which both let the rubber-band overscroll
  // reveal the plain backdrop above the hero (the "white space") and never
  // read as "instant." There's still necessarily ONE scroll event's worth
  // of real overscroll travel before this can react and close things —
  // dismissing is a JS-side state change (this whole layer un-mounting
  // back to the profile screen), so there's no way to make that happen on
  // the same native frame as the touch with zero JS round-trip at all; a
  // small threshold plus the color-matched bleed behind the ScrollView
  // (below) is what keeps that unavoidable sliver from reading as a glitch.
  const DISMISS_PULL = 14;
  // PassportBackdrop stays mounted for the app's whole lifetime (see the
  // file-top comment) — closing never unmounts it, so a ref set once and
  // left set would stay set forever, silently eating every dismiss after
  // the first. Re-armed on every reopen instead of ever being reset by the
  // dismiss path itself, which only runs once per genuine pull.
  const dismissingRef = useRef(false);
  useEffect(() => { if (active) dismissingRef.current = false; }, [active]);
  // Plain callback, not Animated.event — nothing here needs to read scroll
  // position on the native thread (there's no style left that tracks it),
  // so there's no native-driver handler to accidentally re-register mid-
  // session. useCallback with empty deps: created once, stays once,
  // reasoning entirely through refs/setState — no room for the stale- or
  // re-bound-handler class of bug the first version of this had.
  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    if (y < -DISMISS_PULL) {
      if (dismissingRef.current) return;
      dismissingRef.current = true;
      requestClose();
      return;
    }
    const { on, off } = thresholdsRef.current;
    if (!compactShownRef.current && y > on) {
      compactShownRef.current = true;
      setCompactVisible(true);
      Animated.timing(compactAnim, {
        toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }).start();
    } else if (compactShownRef.current && y < off) {
      compactShownRef.current = false;
      Animated.timing(compactAnim, {
        toValue: 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }).start(({ finished }) => { if (finished) setCompactVisible(false); });
    }
  }, [requestClose]);

  // Edge-swipe to close, like iOS's own interactive-pop gesture — this
  // screen isn't a real navigation route (it's a permanently-mounted
  // overlay, not pushed on the Stack), so there's no native swipe-back to
  // inherit; this reproduces the gesture by hand. Confined to a narrow
  // strip right at the left edge (below) rather than the whole screen, so
  // it never competes with ordinary drags on the stamps/cover — activation
  // itself also requires a clearly horizontal motion (activeOffsetX) and
  // bails out to whatever's underneath on a vertical one (failOffsetY), so
  // even a touch that starts in the strip but turns into a scroll doesn't
  // get eaten. requestClose isn't a worklet, so it's called via runOnJS.
  const edgeSwipe = Gesture.Pan()
    .activeOffsetX(15)
    .failOffsetY([-15, 15])
    .onEnd(e => {
      if (e.translationX > 60 || e.velocityX > 600) runOnJS(requestClose)();
    });

  const go = useCallback((path: string) => { requestClose(); router.push(path as never); }, [requestClose, router]);

  const statItems: PassportFaceStatItem[] = [
    { label: 'NP VISITED', value: badgesLoaded ? `${stats.parksVisited}/${stats.parksTotal}` : '–' },
    { label: 'NPS AREAS', value: badgesLoaded ? String(stats.areasVisited) : '–' },
    { label: 'BADGES', value: badgesLoaded ? String(stats.badgesEarned) : '–' },
    { label: stats.friendCount === 1 ? 'FRIEND' : 'FRIENDS', value: friendsLoaded ? String(stats.friendCount) : '–' },
  ].map((item, i) => {
    const href = PASSPORT_STAT_LINKS[i];
    return href ? { ...item, onPress: () => go(href) } : item;
  });
  const progressLabel = !badgesLoaded
    ? 'Loading…'
    : stats.parksTotal > 0 ? `${stats.parksVisited} of ${stats.parksTotal} parks stamped` : 'No parks stamped yet';

  // The cover never collapses now, so PassportFace's own (still-present,
  // untouched) collapse machinery just needs a value that's permanently 0
  // — passing a plain, never-animated Value is enough to keep it rendering
  // its one, full "expanded" layout forever.
  const zeroAnim = useRef(new Animated.Value(0)).current;
  const containerWidthAnim = useRef(new Animated.Value(PASSPORT_CARD_W)).current;

  // The pattern's edge logo lockup is sized/centered for the card block's
  // own span (what the profile hole shows), not the whole pattern's height.
  const edgeTextSize = cardH > 0 ? Math.max(8, cardH * 0.08) : undefined;
  const edgeTextSpan: [number, number] | undefined = cardH > 0
    ? [blockTopRest / PATTERN_H, (blockTopRest + cardH) / PATTERN_H]
    : undefined;

  return (
    <Animated.View
      style={[StyleSheet.absoluteFillObject, { transform: [{ translateY: shiftY }] }]}
      pointerEvents={active ? 'auto' : 'none'}
    >
      {/* Paper backdrop, with a strip of the hero's own color bled across
          its top — an overscroll bounce at the top reveals whatever's back
          here for the instant before handleScroll's live check (below)
          fires requestClose, and the plain cream/dark paper was that "white
          space" showing through above the dark cover for that instant.
          150px comfortably covers any pull the guard lets through. */}
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: paper }]}>
        <View style={{ height: 150, backgroundColor: T.primaryDeep }} />
      </View>

      <ScrollView
        ref={scrollRef}
        style={StyleSheet.absoluteFill}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {/* Cover — ordinary scroll content, no pin, no collapsing height.
            It just scrolls away like anything else; the compact bar
            (below, outside this ScrollView) is what stays on screen. */}
        <View style={[st.hero, { marginTop: -insets.top, backgroundColor: T.primaryDeep }]}>
          <View style={{ position: 'absolute', top: 0, left: 0, width: SCREEN_W, height: PATTERN_H }}>
            <HolographicShine
              staticSize={{ w: SCREEN_W, h: PATTERN_H }}
              edgeTextSize={edgeTextSize}
              edgeTextSpan={edgeTextSpan}
              wavesAboveSeal
            />
          </View>

          {/* Pushes the card block down to line up with the profile's hole
              — a plain spacer, not padding, so it can't interact with the
              pattern's own absolute positioning above. */}
          <View style={{ height: blockTopRest }} />

          <View
            style={st.cardBlock}
            onLayout={e => {
              const h = e.nativeEvent.layout.height;
              setCardH(h);
              onCardHeight(h);
            }}
          >
            <Text style={st.watermark} numberOfLines={1} ellipsizeMode="clip">
              {'PARKQUEST • '.repeat(16)}
            </Text>
            <PassportFace
              avatarUrl={profile.avatarUrl}
              name={profile.name}
              username={profile.username || null}
              joinDate={profile.joinDate}
              bio={profile.bio}
              statItems={statItems}
              progressLabel={progressLabel}
              progressPct={stats.parksTotal > 0 ? (stats.parksVisited / stats.parksTotal) * 100 : 0}
              mrzLine1={mrzLine1}
              mrzLine2={mrzLine2}
              containerWidth={containerWidthAnim}
              collapseFrac={zeroAnim}
              onAvatarPress={onAvatarPress}
              onStatsLayout={onStatsLayout}
            />
          </View>

          <View style={{ height: CARD_GAP_BELOW }} />
        </View>

        <View
          style={[st.sheet, {
            backgroundColor: paper,
            // Always at least a screen tall so the sheet, not the raw
            // paper backdrop, is what's under a short stamp list.
            minHeight: SCREEN_H,
            paddingBottom: insets.bottom + 40,
          }]}
        >
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
                  entering={FadeInUp.delay(Math.min(ri, 8) * 35).duration(360)}
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
        </View>
      </ScrollView>

      {/* Left-edge swipe-to-close hot zone — see edgeSwipe above. Sits on
          top (after the ScrollView in paint order) but is only as wide as
          the edge itself, so it never shadows real content underneath. */}
      <GestureDetector gesture={edgeSwipe}>
        <View style={st.edgeSwipeZone} />
      </GestureDetector>

      {/* Compact bar — a completely separate, statically-laid-out overlay,
          not a collapsed version of the cover above. Only its own opacity
          is ever animated. */}
      <Animated.View
        style={[st.compactBar, { paddingTop: insets.top, backgroundColor: T.primaryDeep, opacity: compactAnim }]}
        pointerEvents={compactVisible ? 'auto' : 'none'}
      >
        <View style={st.compactIdRow}>
          <Avatar url={profile.avatarUrl} name={profile.name ?? 'Explorer'} size={30} />
          <Text style={st.compactName} numberOfLines={1}>{profile.name ?? 'Explorer'}</Text>
          {profile.username ? (
            <Text style={st.compactHandle} numberOfLines={1}>@{profile.username}</Text>
          ) : null}
        </View>
        <CompactStats stats={stats} badgesLoaded={badgesLoaded} friendsLoaded={friendsLoaded} onPress={go} />
      </Animated.View>

      <View style={[st.topBar, { top: insets.top + 4 }]} pointerEvents="box-none">
        <GrowTouchable onPress={requestClose} hitSlop={8} style={st.topBarBtn}>
          <GlassIconBg onMedia fallbackColor="rgba(8,16,12,0.45)" />
          <Ionicons name="close" size={22} color={GOLD} />
        </GrowTouchable>
        <GrowTouchable onPress={() => router.push('/passport-share' as never)} hitSlop={8} style={st.topBarBtn}>
          <GlassIconBg onMedia fallbackColor="rgba(8,16,12,0.45)" />
          <Ionicons name="share-outline" size={20} color={GOLD} />
        </GrowTouchable>
      </View>

      {selectedStamp && (
        <StampDetailModal
          stamp={selectedStamp}
          onClose={() => setSelectedStamp(null)}
          onViewVisits={s => {
            setSelectedStamp(null);
            requestClose();
            router.push({ pathname: '/profile/journal', params: { parkCode: s.park_code, parkName: s.name } } as never);
          }}
          onParkInfo={s => {
            setSelectedStamp(null);
            requestClose();
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
    </Animated.View>
  );
}

const st = StyleSheet.create({
  hero: {
    overflow: 'hidden',
  },
  cardBlock: {
    marginLeft: PASSPORT_CARD_INSET,
    width: PASSPORT_CARD_W,
    paddingHorizontal: CARD_PAD_H,
    paddingVertical: CARD_PAD_V,
  },
  watermark: {
    marginTop: -8,
    marginHorizontal: -CARD_PAD_H,
    marginBottom: 12,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 2.2,
    color: 'rgba(201,169,74,0.28)',
  },
  edgeSwipeZone: {
    position: 'absolute', top: 0, bottom: 0, left: 0, width: 24, zIndex: 15,
  },
  compactBar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5,
    paddingBottom: 10,
    borderBottomWidth: 0.5, borderBottomColor: 'rgba(201,169,74,0.25)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8,
  },
  compactIdRow: {
    height: 44, paddingHorizontal: 64,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
  },
  compactName: {
    fontSize: 15, fontWeight: '800', color: GOLD, letterSpacing: -0.2, flexShrink: 1,
  },
  compactHandle: {
    fontSize: 12, fontWeight: '600', color: 'rgba(201,169,74,0.85)', letterSpacing: 0.6, flexShrink: 1,
  },
  compactStatsRow: {
    flexDirection: 'row', paddingHorizontal: 20, gap: 6, marginTop: 2,
  },
  compactStatTap: { flex: 1 },
  compactStat: { alignItems: 'center' },
  compactStatValue: { fontSize: 14, fontWeight: '800', color: GOLD, letterSpacing: -0.2 },
  compactStatLabel: { fontSize: 8.5, fontWeight: '700', color: 'rgba(201,169,74,0.75)', letterSpacing: 0.8, marginTop: 1 },
  topBar: {
    position: 'absolute', left: 12, right: 12, zIndex: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  topBarBtn: {
    width: 44, height: 44, borderRadius: 22, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  sheet: {
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
