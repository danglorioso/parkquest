import {
  Animated, Dimensions, Image, Platform, StyleSheet,
  Text, TouchableOpacity, View, useColorScheme,
} from 'react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HolographicShine } from '@/components/HolographicShine';
import { ParkStamp } from '@/components/ParkStamp';
import { StampDetailModal } from '@/components/StampDetailModal';
import { PassportWatermark } from '@/components/PassportWatermark';
import { AvatarLightbox } from '@/components/AvatarLightbox';
import type { CustomStampGlyph } from '@parkquest/types';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { STATIC as C, useColors } from '@/lib/palette';
import { buildMrzLines, passportNo, stampDateStr } from '@/lib/passport';
import { GlassIconBg } from '@/components/GlassIconBg';

// ── Constants ─────────────────────────────────────────────────────────────────
// Passport-book aesthetic: gold foil stays fixed across themes (it already
// reads fine on both cream paper and the dark green cover). Paper + ink pair
// light/dark so the book itself follows the phone's theme instead of always
// forcing a light page.

const PAPER       = '#FAF3E0';
const PAPER_DARK  = '#1C1912';
const GOLD        = '#C9A94A';
const P_INK       = '#3A2E1C';
const P_INK_DARK  = '#E8DCC0';
const P_MUTE      = 'rgba(58,46,28,0.45)';
const P_MUTE_DARK = 'rgba(232,220,192,0.45)';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
const W    = Dimensions.get('window').width;

const CELL_W  = Math.floor((W - 32 - 16) / 3);
const STAMP_D = Math.min(88, CELL_W - 8);
const ROWS_PER_PAGE = 4; // 12 stamps = one "book page"

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProfileInfo {
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
}

interface Park {
  park_code: string;
  name: string;
  states: string;
  stamp_glyph: CustomStampGlyph | null;
}

interface Visit {
  park_code: string;
  is_bucket_list: boolean;
  visited_date: string | null;
  rating?: number | null;
  photos?: string[] | null;
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

// ── Row types for FlatList ────────────────────────────────────────────────────

type RowItem =
  | { type: 'header' }
  | { type: 'stamps'; rowIdx: number; items: StampItem[] }
  | { type: 'divider'; pageNum: number }
  | { type: 'empty' }
  | { type: 'skeleton'; idx: number };

// ── Stamp cell ────────────────────────────────────────────────────────────────

function StampCell({ item, onPress, dark }: { item: StampItem; onPress: () => void; dark: boolean }) {
  const date = item.visited_date ? stampDateStr(item.visited_date) : '';
  const ink  = dark ? P_INK_DARK : P_INK;
  const mute = dark ? P_MUTE_DARK : P_MUTE;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={st.stampCell}
    >
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
      {date ? <Text style={[st.stampDate, { color: mute }]}>{date}</Text> : null}
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

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonRow({ dark }: { dark: boolean }) {
  const base = dark ? '232,220,192' : '58,46,28';
  return (
    <View style={st.stampRow}>
      {[0,1,2].map(i => (
        <View key={i} style={st.stampCell}>
          <View style={{ width: STAMP_D, height: STAMP_D, borderRadius: STAMP_D / 2, backgroundColor: `rgba(${base},0.08)` }} />
          <View style={{ width: CELL_W - 12, height: 8, borderRadius: 4, backgroundColor: `rgba(${base},0.06)`, marginTop: 8 }} />
        </View>
      ))}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

// Background moves slower than the content as you scroll — depth cue, not
// a literal "printed on this page" scroll (that'd need a seamlessly
// tileable pattern keyed off scrollY % tileHeight instead of a fixed-size
// watermark). See PassportWatermark's PARALLAX_BUFFER for the matching
// height slack this factor draws down as you scroll.
const PARALLAX_FACTOR = 0.6;

export default function PassportScreen() {
  const { getToken }  = useAuth();
  const { user }      = useUser();
  const router        = useRouter();
  const T             = useColors();
  const isDark        = useColorScheme() === 'dark';
  const paper         = isDark ? PAPER_DARK : PAPER;
  const ink           = isDark ? P_INK_DARK : P_INK;
  const mute          = isDark ? P_MUTE_DARK : P_MUTE;
  const insets        = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;
  const listRef = useRef<Animated.FlatList<RowItem>>(null);
  const handleScroll = useRef(
    Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })
  ).current;

  const [coverH,      setCoverH]      = useState<number | null>(null);
  // Drives the status bar's icon color (see statusBarUnderlay below) — dark
  // once the paper section is what's actually behind the status bar strip,
  // light while the green cover (or its momentary transition flash) is.
  const [pastCover,   setPastCover]   = useState(false);
  const [profile,     setProfile]     = useState<ProfileInfo | null>(null);
  const [visits,      setVisits]      = useState<Visit[]>([]);
  const [allParks,    setAllParks]    = useState<Park[]>([]);
  const [badgeCount,  setBadgeCount]  = useState(0);
  const [totalBadges, setTotalBadges] = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(false);
  const [selectedStamp, setSelectedStamp] = useState<StampItem | null>(null);
  const [avatarLightbox, setAvatarLightbox] = useState(false);

  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const load = useCallback(async () => {
    const tok = await getTokenRef.current();
    if (!tok) return;
    setLoading(true);
    setError(false);
    try {
      const [profRes, visitsRes, parksRes, badgesRes] = await Promise.allSettled([
        fetch(`${BASE}/api/profile`, { headers: { Authorization: `Bearer ${tok}` } }).then(r => r.ok ? r.json() : null),
        fetch(`${BASE}/api/visits`,  { headers: { Authorization: `Bearer ${tok}` } }).then(r => r.ok ? r.json() : []),
        fetch(`${BASE}/api/parks`,   { headers: { Authorization: `Bearer ${tok}` } }).then(r => r.ok ? r.json() : []),
        fetch(`${BASE}/api/badges`,  { headers: { Authorization: `Bearer ${tok}` } }).then(r => r.ok ? r.json() : { badges: [] }),
      ]);
      if ([profRes, visitsRes, parksRes, badgesRes].every(r => r.status === 'rejected')) {
        setError(true);
      }
      if (profRes.status   === 'fulfilled' && profRes.value)   setProfile(profRes.value);
      if (visitsRes.status === 'fulfilled') setVisits(visitsRes.value ?? []);
      if (parksRes.status  === 'fulfilled') setAllParks(parksRes.value ?? []);
      if (badgesRes.status === 'fulfilled') {
        const all = badgesRes.value?.badges ?? badgesRes.value ?? [];
        setBadgeCount(all.filter((b: { earned: boolean }) => b.earned).length);
        setTotalBadges(all.length);
      }
    } catch (e) {
      console.error('Passport load:', e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Toggles the status bar's icon color once the green cover has fully
  // scrolled past — small hysteresis band so it doesn't flicker right at
  // the boundary. Mirrors the thresholds statusBarUnderlay fades on below.
  useEffect(() => {
    if (coverH == null) return;
    const boundary = coverH - insets.top;
    const id = scrollY.addListener(({ value }) => {
      setPastCover(prev => {
        if (!prev && value > boundary + 20) return true;
        if (prev && value < boundary - 20) return false;
        return prev;
      });
    });
    return () => scrollY.removeListener(id);
  }, [coverH, insets.top, scrollY]);

  // All parks: visited (chrono) first, then unvisited
  const allStampItems = useMemo((): StampItem[] => {
    const visitedMap = new Map<string, string>();
    visits.forEach(v => {
      if (!v.is_bucket_list && v.visited_date) visitedMap.set(v.park_code, v.visited_date);
    });
    const visited: StampItem[] = [];
    const unvisited: StampItem[] = [];
    allParks.forEach((p, idx) => {
      const date = visitedMap.get(p.park_code) ?? null;
      const entry: StampItem = {
        park_code: p.park_code, name: p.name, states: p.states,
        visited: !!date, visited_date: date, colorIdx: idx,
        stamp_glyph: p.stamp_glyph,
      };
      if (date) visited.push(entry);
      else unvisited.push(entry);
    });
    visited.sort((a, b) => (a.visited_date ?? '').localeCompare(b.visited_date ?? ''));
    return [...visited, ...unvisited];
  }, [allParks, visits]);

  const visitedCount = useMemo(() => allStampItems.filter(s => s.visited).length, [allStampItems]);
  // Distinct from visitedCount — a park visited twice is one stamped park
  // but two trips, so this counts visit log entries, not unique parks.
  const tripsCount   = useMemo(() => visits.filter(v => !v.is_bucket_list && v.visited_date).length, [visits]);
  // Total photos logged across real visits — reflects actual content the
  // user contributed, unlike bucket-list count (trivially inflatable by
  // just adding every park to the list) which this stat replaced.
  const photoCount   = useMemo(
    () => visits.reduce((n, v) => n + (v.is_bucket_list ? 0 : (v.photos?.length ?? 0)), 0),
    [visits]
  );
  const statesCount  = useMemo(() => {
    const s = new Set<string>();
    allStampItems.filter(si => si.visited).forEach(si => si.states.split(',').forEach(st => s.add(st.trim())));
    return s.size;
  }, [allStampItems]);
  // Not all 50 states have a national park — the real denominator is however
  // many distinct states appear across the 63 parks themselves.
  const totalParkStates = useMemo(() => {
    const s = new Set<string>();
    allStampItems.forEach(si => si.states.split(',').forEach(st => s.add(st.trim())));
    return s.size;
  }, [allStampItems]);

  // First/latest earned stamps — rendered as the actual ParkStamp art on the
  // cover, not text rows. allStampItems already sorts visited chronologically.
  const visitedStamps = useMemo(() => allStampItems.filter(s => s.visited), [allStampItems]);
  const firstStamp  = visitedStamps[0] ?? null;
  const latestStamp = visitedStamps.length > 1 ? visitedStamps[visitedStamps.length - 1] : null;

  // Security-microprint band — mimics a real passport's data-page microtext:
  // document number + bearer name interleaved with park-code/year stamp
  // codes (e.g. "YOSE'24"), not just a plain park-name list. Falls back to
  // a document motto for a fresh passport with no stamps yet.
  const microprint = useMemo(() => {
    const uname = (profile?.username ?? user?.username ?? 'EXPLORER').toUpperCase();
    const num   = passportNo(profile?.username ?? user?.username ?? 'explorer');
    const stampCodes = visitedStamps.map(s => {
      const yy = s.visited_date ? String(new Date(s.visited_date).getFullYear()).slice(-2) : null;
      return `${s.park_code.toUpperCase()}${yy ? `'${yy}` : ''}`;
    });
    const bits = stampCodes.length
      ? [num, uname, ...stampCodes]
      : [num, uname, 'NATIONAL PARK PASSPORT', 'EXPLORE MORE'];
    // Repeat enough to always overflow one clipped line regardless of count
    return (bits.join(' ✦ ') + ' ✦ ').repeat(Math.ceil(20 / Math.max(1, bits.length)));
  }, [visitedStamps, profile?.username, user?.username]);

  // Text "records" rows — computed from real visit logs. Each is null when
  // there's no data to back it, and its row just doesn't render.
  const records = useMemo(() => {
    const parkName = (code: string) => allParks.find(p => p.park_code === code)?.name?.replace(/ National Park.*$/, '') ?? code;
    const dated = visits.filter(v => !v.is_bucket_list && v.visited_date);
    if (dated.length === 0) {
      return { mostVisited: null, topRated: null, favSeason: null, busiestYear: null, exploring: null };
    }

    const counts = new Map<string, number>();
    dated.forEach(v => counts.set(v.park_code, (counts.get(v.park_code) ?? 0) + 1));
    let mvCode: string | null = null, mvCount = 1;
    counts.forEach((n, code) => { if (n > mvCount) { mvCount = n; mvCode = code; } });

    // Highest rating wins; among ties, the most recent visit
    const rated = dated.filter(v => typeof v.rating === 'number');
    const top = rated.sort((a, b) =>
      (b.rating! - a.rating!) || (a.visited_date ?? '').localeCompare(b.visited_date ?? '')
    )[0] ?? null;

    // Favorite season — which quarter of the wheel gets the most trips.
    // Dec–Feb winter, Mar–May spring, Jun–Aug summer, Sep–Nov fall.
    const SEASONS = ['Winter ❄️', 'Spring 🌸', 'Summer ☀️', 'Fall 🍂'];
    const seasonIdx = (m: number) => (m === 11 || m < 2) ? 0 : m < 5 ? 1 : m < 8 ? 2 : 3;
    const seasonCounts = [0, 0, 0, 0];
    dated.forEach(v => { seasonCounts[seasonIdx(new Date(v.visited_date!).getMonth())]++; });
    const favIdx = seasonCounts.indexOf(Math.max(...seasonCounts));

    // Busiest year — most stamps logged; ties go to the most recent year
    const yearCounts = new Map<number, number>();
    dated.forEach(v => {
      const y = new Date(v.visited_date!).getFullYear();
      yearCounts.set(y, (yearCounts.get(y) ?? 0) + 1);
    });
    let byYear = 0, byCount = 0;
    yearCounts.forEach((n, y) => {
      if (n > byCount || (n === byCount && y > byYear)) { byYear = y; byCount = n; }
    });

    // Days on trail — how long this passport has been collecting stamps
    const firstDate = dated.map(v => v.visited_date!).sort()[0];
    const days = Math.max(1, Math.floor((Date.now() - new Date(firstDate).getTime()) / 86_400_000));
    const sinceStr = new Date(firstDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

    return {
      // Only meaningful once some park has 2+ visits
      mostVisited: mvCode ? { name: parkName(mvCode), detail: `${mvCount} visits` } : null,
      topRated:    top ? { name: parkName(top.park_code), detail: `${'★'.repeat(Math.round(top.rating!))}` } : null,
      favSeason:   { name: SEASONS[favIdx], detail: `${seasonCounts[favIdx]} ${seasonCounts[favIdx] === 1 ? 'trip' : 'trips'}` },
      busiestYear: { name: String(byYear), detail: `${byCount} ${byCount === 1 ? 'stamp' : 'stamps'}` },
      exploring:   { name: `${days.toLocaleString()} days`, detail: `since ${sinceStr}` },
    };
  }, [visits, allParks]);

  const avatarUrl = profile?.avatar_url || user?.imageUrl || null;
  // null = profile not loaded yet — header shows a skeleton bar, not "Explorer"
  const name = profile?.display_name ?? profile?.username ?? null;
  const pNo  = passportNo(profile?.username ?? user?.username ?? 'explorer');
  const joinDate = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;

  // MRZ-style bottom strip — same format as the profile page's passport card
  const [mrzLine1, mrzLine2] = buildMrzLines({
    name: name ?? 'Explorer',
    username: profile?.username ?? user?.username ?? '',
    userId: user?.id ?? null,
    createdAt: user?.createdAt ?? null,
    visitedCount,
  });

  // Build FlatList rows: header + stamp rows (with page dividers)
  const listData = useMemo((): RowItem[] => {
    // Still loading: skeleton stamp rows instead of a blank page
    if (loading) {
      return [{ type: 'header' }, { type: 'skeleton', idx: 0 }, { type: 'skeleton', idx: 1 }, { type: 'skeleton', idx: 2 }];
    }

    const rows: RowItem[] = [{ type: 'header' }];

    if (allStampItems.length === 0) {
      rows.push({ type: 'empty' });
      return rows;
    }

    for (let i = 0; i < allStampItems.length; i += 3) {
      const rowIdx = i / 3;
      // Page divider before each new page (except the first)
      if (rowIdx > 0 && rowIdx % ROWS_PER_PAGE === 0) {
        rows.push({ type: 'divider', pageNum: Math.floor(rowIdx / ROWS_PER_PAGE) + 1 });
      }
      rows.push({ type: 'stamps', rowIdx, items: allStampItems.slice(i, i + 3) });
    }

    return rows;
  }, [loading, allStampItems]);

  // This route renders with no native stack header (see profile/_layout) —
  // the green cover owns the whole top of the screen, including under the
  // status bar. These two float above everything: a green underlay that
  // bridges the status-bar strip across the cover→paper seam, and the back
  // button the native header would otherwise have provided.
  // Invisible while the cover itself is under the status bar (so the cover's
  // guilloche pattern — not a flat green strip — shows at the very top);
  // flashes green just long enough to cover the seam as the cover's bottom
  // edge passes the status bar; then fades back out, since past that point
  // it's the paper stamp pages behind the strip, not the cover, and it
  // should read as paper (see the pastCover-driven StatusBar style below).
  const statusBarUnderlay = (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: insets.top,
        backgroundColor: T.primaryDeep, zIndex: 10,
        opacity: coverH
          ? scrollY.interpolate({
              inputRange: [
                coverH - insets.top - 30, coverH - insets.top,
                coverH - insets.top + 20, coverH - insets.top + 50,
              ],
              outputRange: [0, 1, 1, 0],
              extrapolate: 'clamp',
            })
          : 0,
      }}
    />
  );
  // Modal-style top bar (Flighty-style): X to dismiss, centered title,
  // share on the right — floats over the green cover.
  const dismiss = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  };
  const topBar = (
    <View style={[st.topBar, { top: insets.top + 4 }]} pointerEvents="box-none">
      <TouchableOpacity onPress={dismiss} hitSlop={8} style={st.topBarBtn}>
        <GlassIconBg onMedia fallbackColor="rgba(8,16,12,0.45)" />
        <Ionicons name="close" size={22} color={GOLD} />
      </TouchableOpacity>
      <Text style={st.topBarTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
        ParkQuest Passport
      </Text>
      <TouchableOpacity
        onPress={() => router.push('/passport-share' as never)}
        hitSlop={8}
        style={st.topBarBtn}
      >
        <GlassIconBg onMedia fallbackColor="rgba(8,16,12,0.45)" />
        <Ionicons name="share-outline" size={20} color={GOLD} />
      </TouchableOpacity>
    </View>
  );

  // Scroll-down hint — chevron at the bottom of the screen that fades away
  // as soon as the user starts scrolling (there's always content below the
  // near-full-screen cover). Tapping it scrolls straight past the cover to
  // the stamp grid, same boundary statusBarUnderlay/pastCover key off.
  const scrollHint = (
    <Animated.View
      pointerEvents="box-none"
      style={[
        st.scrollHint,
        {
          bottom: insets.bottom + 14,
          opacity: scrollY.interpolate({
            inputRange: [0, 60],
            outputRange: [1, 0],
            extrapolate: 'clamp',
          }),
        },
      ]}
    >
      <TouchableOpacity
        // The top bar floats over the screen's top edge rather than pushing
        // content down, so it covers the same on-screen pixels regardless of
        // scroll position. Scrolling to exactly coverH would put the first
        // stamp row's top edge right at screen y=0 — under the bar (and the
        // Dynamic Island above it). Stop short so that band still shows the
        // (harmless) bottom of the cover instead.
        onPress={() => listRef.current?.scrollToOffset({
          offset: Math.max(0, (coverH ?? 0) - (insets.top + 58)),
          animated: true,
        })}
        hitSlop={10}
        style={st.scrollHintBtn}
      >
        <GlassIconBg onMedia fallbackColor="rgba(8,16,12,0.45)" />
        <Ionicons name="chevron-down" size={20} color={GOLD} />
      </TouchableOpacity>
    </Animated.View>
  );

  if (error && allParks.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: paper }} edges={['bottom']}>
        <StatusBar style="light" />
        {statusBarUnderlay}
        {topBar}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <Ionicons name="cloud-offline-outline" size={36} color={C.inkMute} />
          <Text style={{ color: C.inkMute, fontSize: 15, fontWeight: '600' }}>Failed to load</Text>
          <TouchableOpacity
            onPress={() => load()}
            style={{ paddingHorizontal: 20, paddingVertical: 10, backgroundColor: T.primary, borderRadius: 12 }}
          >
            <Text style={{ color: C.onPrimary, fontWeight: '700', fontSize: 14 }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: paper }} edges={['bottom']}>
      <StatusBar style={pastCover ? 'dark' : 'light'} />
      {statusBarUnderlay}
      {topBar}
      {scrollHint}
      <Animated.View
        pointerEvents="none"
        style={{ transform: [{ translateY: Animated.multiply(scrollY, -PARALLAX_FACTOR) }] }}
      >
        <PassportWatermark dark={isDark} />
      </Animated.View>
      <Animated.FlatList
        ref={listRef}
        data={listData}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        keyExtractor={(item, idx) => {
          if (item.type === 'header') return 'header';
          if (item.type === 'divider') return `div-${item.pageNum}`;
          if (item.type === 'empty') return 'empty';
          if (item.type === 'skeleton') return `skel-${item.idx}`;
          return `row-${item.rowIdx}`;
        }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        renderItem={({ item }) => {
          if (item.type === 'header') {
            return (
              <View>
                {/* ── Cover — near-full-screen green passport, extending up
                    under the status bar. Shadow lives on this outer wrapper,
                    not st.cover itself — st.cover has overflow:hidden to clip
                    the Svg background, and overflow:hidden on the same view
                    would clip its own shadow too. */}
                <View
                  style={[st.coverShadow, { backgroundColor: T.primaryDeep }]}
                  onLayout={e => setCoverH(e.nativeEvent.layout.height)}
                >
                  {/* Pull-down slab: solid green painted well above the cover
                      so overscroll reveals cover color, never the paper
                      behind the list — content itself doesn't move or scale. */}
                  <View
                    pointerEvents="none"
                    style={{ position: 'absolute', top: -600, left: 0, right: 0, height: 600, backgroundColor: T.primaryDeep }}
                  />
                  {/* paddingTop clears the status bar + floating back button */}
                  <View style={[st.cover, { backgroundColor: T.primaryDeep, paddingTop: insets.top + 56 }]}>
                    {/* Edge text pinned to roughly name-top → stats-bottom.
                        staticSize (window dims — the cover is near-full-screen
                        and full-bleed) instead of self-measurement: the cover's
                        height shifts when data lands, and measured geometry
                        rebuilt + visibly rescaled the whole pattern mid-look. */}
                    <HolographicShine
                      edgeTextSize={30}
                      edgeTextSpan={[0.09, 0.32]}
                      staticSize={{ w: W, h: Dimensions.get('window').height }}
                      lineIntensity={0.05}
                      wavesAboveSeal
                    />

                    <View style={st.coverMeta}>
                      {/* numberOfLines=1 + clip (no ellipsis) forces this onto one
                          line and lets it bleed off the cover's right edge — same
                          "runs past the page" printed-document feel as the corner
                          watermark band, rather than wrapping to a second line. */}
                      <Text style={st.headerKicker} numberOfLines={1} ellipsizeMode="clip">
                        OFFICIAL RECORD OF VISITATION · AMERICA'S 63 NATIONAL PARKS · PARKQUEST.ME
                      </Text>
                    </View>

                    <View style={st.coverIdentity}>
                      <TouchableOpacity
                        style={[st.coverAvatar, { backgroundColor: T.primary }]}
                        activeOpacity={avatarUrl ? 0.85 : 1}
                        disabled={!avatarUrl}
                        onPress={() => setAvatarLightbox(true)}
                      >
                        {avatarUrl ? (
                          // Slight overscale — some avatar sources (e.g. Clerk's default
                          // silhouette image) have their graphic inset from the image's
                          // own edges, so a plain 100% cover still shows a sliver of its
                          // background at top/bottom inside our circular mask.
                          <Image
                            source={{ uri: avatarUrl }}
                            style={{ width: '100%', height: '100%', transform: [{ scale: 1.15 }] }}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                            {name ? (
                              <Text style={{ fontSize: 30, fontWeight: '900', color: GOLD }}>{name.slice(0,2).toUpperCase()}</Text>
                            ) : (
                              <Ionicons name="person" size={30} color={GOLD} style={{ opacity: 0.5 }} />
                            )}
                          </View>
                        )}
                      </TouchableOpacity>
                      <View style={{ flex: 1 }}>
                        {name ? (
                          <Text style={st.coverName} numberOfLines={1} adjustsFontSizeToFit>{name}</Text>
                        ) : (
                          // Skeleton bars sized to the real name (27pt ≈ 32 line)
                          // + handle (15pt ≈ 18 line, marginTop 3) so the cover
                          // holds its final height while the profile loads.
                          <>
                            <View style={{ width: 180, height: 32, borderRadius: 6, backgroundColor: 'rgba(8,16,12,0.55)' }} />
                            <View style={{ width: 110, height: 18, borderRadius: 5, backgroundColor: 'rgba(8,16,12,0.45)', marginTop: 3 }} />
                          </>
                        )}
                        {profile?.username ? (
                          <Text style={st.coverHandle}>@{profile.username}</Text>
                        ) : null}
                        {joinDate ? (
                          <Text style={st.coverJoined}>Joined {joinDate}</Text>
                        ) : null}
                      </View>
                    </View>

                    {/* Watermark band — same repeating-text security-print
                        motif as the profile page's passport card */}
                    <Text style={st.coverWatermark} numberOfLines={1} ellipsizeMode="clip" pointerEvents="none">
                      {microprint}
                    </Text>

                    {/* Solid scrim behind the numbers — the guilloche pattern reads
                        fine as texture against plain gold text, but not against
                        dense stat digits; this plate guarantees contrast regardless
                        of how the pattern underneath gets tuned later. */}
                    <View style={st.statsPlate}>
                      <View style={st.infoStats}>
                        {([
                          { label: 'TRIPS',  icon: 'footsteps', value: loading ? '–' : String(tripsCount) },
                          // Has a real denominator worth showing — not all 50 US
                          // states have a national park, so a bare count reads
                          // as "only visited N states" when N/50 was never the
                          // real ceiling. totalParkStates is the true max — kept,
                          // but rendered small/muted (a "/of" suffix, not a
                          // second headline number) so it doesn't fight the
                          // actual stat for attention.
                          { label: 'STATES', icon: 'map',       value: loading ? '–' : String(statesCount), sub: loading ? '' : `/${totalParkStates}` },
                          // Photos, not bucket-list count — bucket list is
                          // trivially inflatable (add every park) and already
                          // reachable via the Map/Parks tab filters, so it
                          // isn't a meaningful passport stat.
                          { label: 'PHOTOS', icon: 'camera',    value: loading ? '–' : String(photoCount) },
                          { label: 'BADGES', icon: 'ribbon',    value: loading ? '–' : String(badgeCount) },
                        ] as const).map((s, i) => {
                          return (
                            <View
                              key={s.label}
                              style={[st.infoStat, i > 0 && st.infoStatBorder]}
                            >
                              <Ionicons name={s.icon} size={15} color={GOLD} style={st.infoStatIcon} />
                              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                                <Text style={st.infoStatVal}>{s.value}</Text>
                                {'sub' in s && s.sub ? <Text style={st.infoStatSub}>{s.sub}</Text> : null}
                              </Text>
                              <Text style={st.infoStatLabel}>{s.label}</Text>
                            </View>
                          );
                        })}
                      </View>

                      <View style={st.infoProgress}>
                        {/* One line, never wraps: copy left, percent right */}
                        <View style={st.infoProgressRow}>
                          <Text style={st.infoProgressText} numberOfLines={1}>
                            {loading ? 'Loading…' : `${visitedCount} of 63 parks stamped`}
                          </Text>
                          {!loading && (
                            <Text style={st.infoProgressPct}>
                              {Math.round((visitedCount / 63) * 100)}%
                            </Text>
                          )}
                        </View>
                        <View style={st.progressTrack}>
                          <View style={[st.progressFill, { width: `${(visitedCount / 63) * 100}%` as `${number}%` }]} />
                        </View>
                      </View>
                    </View>

                    {/* While loading, hold the chips' space with fixed-height
                        skeletons sized exactly like a loaded chip — otherwise
                        the cover changes height when data lands. (No records
                        skeleton: most accounts have no records rows, and
                        reserving 78px for them left the loading cover taller
                        than the finished one.) */}
                    {loading && (
                      <View style={st.stampChipRow}>
                        {[0, 1].map(i => <View key={i} style={[st.stampChip, st.chipSkeleton]} />)}
                      </View>
                    )}

                    {/* First/latest earned stamps — the real stamp art, straight
                        on the green cover */}
                    {!loading && firstStamp && (
                      <View style={st.stampChipRow}>
                        {([
                          { label: 'FIRST STAMP',  item: firstStamp },
                          ...(latestStamp ? [{ label: 'LATEST STAMP', item: latestStamp }] : []),
                        ]).map(({ label, item: s }) => (
                          <TouchableOpacity
                            key={label}
                            style={st.stampChip}
                            activeOpacity={0.8}
                            onPress={() => setSelectedStamp(s)}
                          >
                            <Text style={st.stampChipLabel}>{label}</Text>
                            {/* idSuffix: the same park also renders in the stamp
                                grid below — TextPath def ids must stay unique */}
                            <ParkStamp
                              parkCode={s.park_code}
                              name={s.name}
                              states={s.states}
                              colorIdx={s.colorIdx}
                              size={92}
                              idSuffix="-chip"
                              inkColor={GOLD}
                              customGlyph={s.stamp_glyph}
                            />
                            {s.visited_date ? (
                              <Text style={st.stampChipDate}>{stampDateStr(s.visited_date)}</Text>
                            ) : null}
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    {/* Records — personal superlatives + fun facts pulled from the visit log */}
                    {!loading && (records.mostVisited || records.topRated || records.favSeason) && (
                      <View style={[st.statsPlate, { marginTop: 10 }]}>
                        {([
                          { label: 'MOST VISITED',  rec: records.mostVisited },
                          { label: 'TOP RATED',     rec: records.topRated },
                          { label: 'TRAIL SEASON',  rec: records.favSeason },
                          { label: 'BUSIEST YEAR',  rec: records.busiestYear },
                          { label: 'DAYS ON TRAIL', rec: records.exploring },
                        ] as const).filter(r => r.rec).map((r, i) => (
                          <View key={r.label} style={[st.recordRow, i > 0 && st.recordRowBorder]}>
                            <Text style={st.recordLabel}>{r.label}</Text>
                            <Text style={st.recordValue} numberOfLines={1}>
                              {r.rec!.name}
                              <Text style={st.recordDetail}>  ·  {r.rec!.detail}</Text>
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Passport number — in normal flow (not absolute) so it's
                        guaranteed to render below the stats block rather than
                        relying on bottom-offset math to avoid overlapping it */}
                    <Text style={st.coverCorner} pointerEvents="none">NO · {pNo}</Text>

                    {/* MRZ strip — same machine-readable-zone footer as the
                        profile card; the "official document" closer */}
                    <View style={st.mrzStrip}>
                      <Text style={st.mrzText} numberOfLines={1}>{mrzLine1}</Text>
                      <Text style={st.mrzText} numberOfLines={1}>{mrzLine2}</Text>
                    </View>
                  </View>
                </View>

                {/* Bio — kept on paper below the cover, like a passport's
                    own data page rather than the shiny cover itself */}
                {profile?.bio ? (
                  <View style={st.infoPage}>
                    <Text style={[st.infoBio, { color: ink }]}>{profile.bio}</Text>
                  </View>
                ) : null}
              </View>
            );
          }

          if (item.type === 'divider') {
            return (
              <View style={st.pageDivider}>
                <View style={st.pageDividerLine} />
                <Text style={st.pageDividerText}>· {item.pageNum} ·</Text>
                <View style={st.pageDividerLine} />
              </View>
            );
          }

          if (item.type === 'skeleton') {
            return <SkeletonRow dark={isDark} />;
          }

          if (item.type === 'empty') {
            return (
              <View style={{ alignItems: 'center', paddingTop: 48, paddingHorizontal: 32, gap: 10 }}>
                <Text style={{ fontSize: 32 }}>🏕</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: ink, textAlign: 'center' }}>No stamps yet</Text>
                <Text style={{ fontSize: 13, color: mute, textAlign: 'center', lineHeight: 19 }}>
                  Log your first park visit to earn your first stamp.
                </Text>
              </View>
            );
          }

          // stamps row
          return (
            <View style={st.stampRow}>
              {item.items.map(s => s.visited ? (
                <StampCell key={s.park_code} item={s} onPress={() => setSelectedStamp(s)} dark={isDark} />
              ) : (
                <StampPlaceholder key={s.park_code} item={s} dark={isDark} />
              ))}
              {/* Pad short last row */}
              {item.items.length < 3 && Array.from({ length: 3 - item.items.length }).map((_, i) => (
                <View key={`pad-${i}`} style={{ width: CELL_W }} />
              ))}
            </View>
          );
        }}
      />

      {selectedStamp && (
        <StampDetailModal
          stamp={selectedStamp}
          onClose={() => setSelectedStamp(null)}
          onViewVisits={s => {
            setSelectedStamp(null);
            router.push({ pathname: '/profile/journal', params: { parkCode: s.park_code, parkName: s.name } } as never);
          }}
          onParkInfo={s => {
            setSelectedStamp(null);
            router.push(`/park/${s.park_code}` as never);
          }}
        />
      )}

      <AvatarLightbox visible={avatarLightbox} url={avatarUrl} onClose={() => setAvatarLightbox(false)} />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  // ── Modal top bar (X / title / share) ──
  topBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topBarBtn: {
    // 44pt — the app-wide round icon button size (matches the park page
    // header buttons); GlassIconBg supplies the fill, so no backgroundColor.
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: GOLD,
    letterSpacing: 0.3,
  },
  // Scroll-down hint chevron, floating over the bottom of the cover
  scrollHint: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 20,
  },
  scrollHintBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Outer shadow layer — full-bleed (no margins/radius), so the shadow is
  // only visible peeking out along the bottom edge, like the cover lifting
  // slightly off the paper page beneath it.
  coverShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  // ── Cover (near-full-screen green passport, up under the status bar) ──
  cover: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    overflow: 'hidden',
    borderBottomWidth: 3,
    borderBottomColor: GOLD + '44',
  },
  coverMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: -20,   // bleed past the card's own padding, edge-to-edge
    marginBottom: 14,
  },
  headerKicker: {
    fontSize: 10,
    fontWeight: '700',
    color: GOLD,
    letterSpacing: 1.8,
    opacity: 0.26,   // watermark, not headline — reads on a second look
  },
  // Passport number + site, relocated to the cover's bottom-left corner —
  // was sharing the top kicker row, but combined they were wide enough to
  // overlap ("...PASSPORTNO...") rather than wrap or truncate cleanly.
  // Passport number, below the stats block — was sharing the top kicker
  // row, but combined they were wide enough to overlap ("...PASSPORTNO...")
  // rather than wrap or truncate cleanly.
  coverCorner: {
    marginTop: 10,
    fontSize: 10,
    fontWeight: '600',
    color: GOLD,
    letterSpacing: 1.1,
    opacity: 0.65,
  },
  // First/latest stamp chips — stamps sit directly on the green cover
  stampChipRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  stampChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    gap: 6,
  },
  stampChipLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: GOLD,
    opacity: 0.75,
    letterSpacing: 1.5,
  },
  stampChipDate: {
    fontSize: 10,
    color: GOLD,
    opacity: 0.65,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  // Sized to match a loaded chip (label + 92px stamp + date + padding) so
  // the cover doesn't change height when real data replaces the skeleton
  chipSkeleton: {
    height: 148,
    borderRadius: 12,
    // Opaque enough to hide the cover's wave pattern behind it — the old
    // 0.08 was near-see-through and let the swirl lines bleed through the
    // skeleton instead of sitting behind it.
    backgroundColor: 'rgba(8,16,12,0.55)',
  },
  // Records rows — label/value superlatives inside a stats plate
  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    paddingHorizontal: 6,
    gap: 12,
  },
  recordRowBorder: {
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(201,169,74,0.18)',
  },
  recordLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: GOLD,
    letterSpacing: 1.5,
    opacity: 0.75,
  },
  recordValue: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
    color: GOLD,
    letterSpacing: 0.2,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  recordDetail: {
    fontWeight: '600',
    opacity: 0.7,
  },
  // Machine-readable-zone footer — same treatment as the profile card's
  mrzStrip: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(201,169,74,0.15)',
  },
  mrzText: {
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: 9,
    color: 'rgba(201,169,74,0.35)',
    letterSpacing: 1.5,
    lineHeight: 14,
  },
  coverIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 18,
  },
  coverAvatar: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 2,
    borderColor: GOLD + '66',
    overflow: 'hidden',
    flexShrink: 0,
  },
  coverName: {
    fontSize: 27,
    fontWeight: '800',
    color: GOLD,
    letterSpacing: -0.4,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  coverHandle: {
    fontSize: 15,
    fontWeight: '600',
    color: GOLD,
    opacity: 0.75,
    letterSpacing: 0.4,
    marginTop: 3,
  },
  coverJoined: {
    fontSize: 13,
    fontWeight: '500',
    color: GOLD,
    opacity: 0.6,
    letterSpacing: 0.3,
    marginTop: 3,
  },
  // Repeating-text security-print band — same motif as the profile page's
  // passport card watermark, bled full-width past the cover's own padding.
  coverWatermark: {
    marginHorizontal: -20,
    marginBottom: 14,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
    color: 'rgba(201,169,74,0.16)',
  },
  // Solid-ish backing so the stat digits stay legible over the guilloche
  // pattern regardless of how that pattern's own opacity gets tuned.
  statsPlate: {
    backgroundColor: 'rgba(8,16,12,0.42)',
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },

  // ── Info page (paper — bio only, like a passport's own data page) ──
  // No backgroundColor here — the screen-level PassportWatermark shows through.
  infoPage: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 6,
  },
  infoBio: {
    fontSize: 13,
    fontStyle: 'italic',
    color: P_INK,
    opacity: 0.75,
    lineHeight: 18,
    marginBottom: 14,
  },
  // Stats + progress now live inside the dark cover, not the paper page
  // below it — gold-on-green like the rest of the cover, matching the
  // profile page's own passport-card stats.
  infoStats: {
    flexDirection: 'row',
    paddingVertical: 12,
    marginBottom: 10,
  },
  infoStat: {
    flex: 1,
    alignItems: 'center',
  },
  infoStatBorder: {
    borderLeftWidth: 0.5,
    borderLeftColor: 'rgba(201,169,74,0.3)',
  },
  infoStatIcon: {
    opacity: 0.7,
    marginBottom: 3,
  },
  infoStatLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: GOLD,
    letterSpacing: 1.5,
    opacity: 0.7,
    marginTop: 2,
  },
  infoStatVal: {
    fontSize: 26,
    fontWeight: '800',
    color: GOLD,
    letterSpacing: -0.5,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  infoStatSub: {
    fontSize: 13,
    fontWeight: '700',
    color: GOLD,
    opacity: 0.55,
    letterSpacing: -0.2,
  },
  infoProgress: {
    gap: 6,
    paddingBottom: 12,
  },
  // Lines up with progressTrack's own inset below, without touching the bar's width
  infoProgressRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    gap: 8,
  },
  infoProgressText: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '600',
    color: GOLD,
    opacity: 0.75,
    letterSpacing: 0.5,
  },
  infoProgressPct: {
    fontSize: 11,
    fontWeight: '800',
    color: GOLD,
    opacity: 0.9,
    letterSpacing: 0.5,
  },
  progressTrack: {
    height: 3,
    marginHorizontal: 16,
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

  // ── Book stamp rows ──
  stampRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
  },
  stampCell: {
    width: CELL_W,
    alignItems: 'center',
    paddingVertical: 14,
  },
  stampName: {
    fontSize: 11,
    fontWeight: '600',
    color: P_INK,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 14,
    maxWidth: CELL_W - 8,
  },
  stampDate: {
    fontSize: 10,
    color: P_MUTE,
    textAlign: 'center',
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  placeholderCircle: {
    borderWidth: 1.5,
    borderColor: P_INK,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Page divider ──
  pageDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 10,
  },
  pageDividerLine: {
    flex: 1,
    height: 0.5,
    backgroundColor: GOLD + '55',
  },
  pageDividerText: {
    fontSize: 10,
    fontWeight: '700',
    color: GOLD + 'AA',
    letterSpacing: 2,
  },
});
