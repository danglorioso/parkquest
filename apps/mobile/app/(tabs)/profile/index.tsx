import {
  ActivityIndicator, Animated, Dimensions, Easing, Linking, RefreshControl, ScrollView, Share, StyleSheet,
  Text, TouchableOpacity, View, Alert, useColorScheme,
} from 'react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useScrollToTop } from '@react-navigation/native';
import { useAuth, useUser, useClerk } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { HeaderBlurFade } from '@/components/HeaderBlurFade';
import { passportStatHitRects, type PassportStatsRect } from '@/components/PassportFace';
import type { BadgeColors } from '@/lib/badges';
import { BadgeDetailModal, BadgePatch } from '@/components/BadgeDetailModal';
import { BadgeShareSheet } from '@/components/BadgeShareSheet';
import { StampDetailModal } from '@/components/StampDetailModal';
import { Wordmark } from '@/components/Wordmark';
import { GlassIconBg } from '@/components/GlassIconBg';
import { GlassView, GlassContainer, liquidGlassAvailable } from '@/lib/glass';
import { ParkStamp } from '@/components/ParkStamp';
import type { CustomStampGlyph } from '@parkquest/types';
import { NotificationBell } from '@/components/NotificationCenter';
import { SearchOverlay } from '@/components/SearchOverlay';
import { EmptyState } from '@/components/EmptyState';
import {
  PassportBackdrop, PASSPORT_CARD_INSET, PASSPORT_CARD_RADIUS, PASSPORT_CARD_W, PASSPORT_STAT_LINKS,
} from '@/components/PassportBackdrop';
import { AvatarLightbox } from '@/components/AvatarLightbox';
import { FeedbackSheet } from '@/components/FeedbackSheet';
import { STATIC as C, colorStr, dyn, useColors } from '@/lib/palette';
import { useTabBarSpace } from '@/components/FloatingTabBar';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';

// Passport gold foil — fixed across palettes, matches the passport screen
const GOLD = '#F0C550';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

const SCREEN_W = Dimensions.get('window').width;
// Cream frame above the hole (between the top bar and the card's top edge).
const HOLE_TOP_PAD = 20;

// SVG path for the page's cream "frame": a full-width rect with the card's
// rounded rect cut out of it (evenodd), so the passport backdrop shows
// through the cutout. This is how the profile screen shows a passport card
// without drawing one — see PassportBackdrop's own comment.
function frameHolePath(frameH: number, holeTop: number, holeH: number) {
  const x = PASSPORT_CARD_INSET, y = holeTop, w = PASSPORT_CARD_W, h = holeH, r = PASSPORT_CARD_RADIUS;
  // Before the backdrop has reported its card block's height there's no
  // hole to cut yet — a degenerate rounded rect would draw garbage arcs.
  // The rect runs 1pt past frameH — see the Svg it's drawn into.
  if (h < r * 2) return { frame: `M0 0 H${SCREEN_W} V${frameH + 1} H0 Z`, hole: null };
  const hole =
    `M${x + r} ${y} H${x + w - r} A${r} ${r} 0 0 1 ${x + w} ${y + r} V${y + h - r} ` +
    `A${r} ${r} 0 0 1 ${x + w - r} ${y + h} H${x + r} A${r} ${r} 0 0 1 ${x} ${y + h - r} ` +
    `V${y + r} A${r} ${r} 0 0 1 ${x + r} ${y} Z`;
  return { frame: `M0 0 H${SCREEN_W} V${frameH + 1} H0 Z ${hole}`, hole };
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProfileInfo {
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
}

interface BadgeSummary {
  id: string;
  name: string;
  emoji: string;
  tier: string;
  colors?: BadgeColors | null;
  earned: boolean;
  earned_at: string | null;
}

interface Park {
  park_code: string;
  name: string;
  states: string;
}

interface StampPreview {
  park_code: string;
  name: string;
  states: string;
  colorIdx: number;
  stamp_glyph: CustomStampGlyph | null;
  visited_date: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────


async function apiFetch<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Loading skeletons — subtle placeholders while data streams in ──────────────

function usePulse() {
  const pulse = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.55, duration: 750, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return pulse;
}

// Horizontal strip placeholder — matches the stamp/badge preview rows
function PreviewSkeleton() {
  const pulse = usePulse();
  return (
    <Animated.View style={{ flexDirection: 'row', gap: 6, paddingBottom: 4, opacity: pulse }}>
      {[0, 1, 2, 3].map(i => (
        <View key={i} style={styles.badgePreviewItem}>
          <View style={styles.skeletonCircle} />
          <View style={styles.skeletonLine} />
        </View>
      ))}
    </Animated.View>
  );
}

// ── Nav row ───────────────────────────────────────────────────────────────────

function NavRow({
  icon, label, subtitle, count, onPress, danger,
}: {
  icon: string; label: string; subtitle?: string;
  count?: number | string; onPress: () => void; danger?: boolean;
}) {
  const T = useColors();
  return (
    <TouchableOpacity onPress={onPress} style={styles.navRow} activeOpacity={0.7}>
      <View style={[styles.navIcon, { backgroundColor: T.primary + '12' }, danger && { backgroundColor: `${T.accent}1F` }]}>
        <Ionicons name={icon as any} size={18} color={danger ? T.accent : T.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.navLabel, danger && { color: T.accent }]}>{label}</Text>
        {subtitle ? <Text style={styles.navSub}>{subtitle}</Text> : null}
      </View>
      {count != null ? (
        <View style={styles.navCount}>
          <Text style={styles.navCountText}>{count}</Text>
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={15} color={C.inkMute} style={{ opacity: 0.6 }} />
    </TouchableOpacity>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const router   = useRouter();
  const { getToken } = useAuth();
  const C = useColors();
  const tabBarSpace = useTabBarSpace();
  const { user }     = useUser();
  const { signOut }  = useClerk();
  // Floating glass top bar — duplicated from the feed screen's header so both
  // tabs share the same look (blur/glass fill, safe-area math, hairline).
  const insets = useSafeAreaInsets();
  const TOP_BAR_H = insets.top + 50;
  const barGlass = liquidGlassAvailable && GlassView != null && GlassContainer != null;
  const isDark = useColorScheme() === 'dark';

  const [profile,      setProfile]      = useState<ProfileInfo | null>(null);
  // National Parks only (the curated 63), deduped by park_code — sourced
  // from /api/badges' stats.parkScopes.national_park, not computed from raw
  // visits here, so this can't drift from the passport screen's own count.
  const [parksVisited, setParksVisited] = useState(0);
  const [parksTotal,   setParksTotal]   = useState(0);
  // Every park area regardless of designation — mirrors the passport
  // screen's own AREAS stat (stats.parkScopes.all), not just the curated 63.
  const [areasVisited, setAreasVisited] = useState(0);
  const [badgesEarned, setBadgesEarned] = useState(0);
  const [totalBadges,  setTotalBadges]  = useState(0);
  const [friendCount,  setFriendCount]  = useState(0);
  const [earnedBadges, setEarnedBadges] = useState<BadgeSummary[]>([]);
  // Full earned list (not the 5-item preview slice) — handed to the passport
  // expand overlay's badges section so it needs no fetch of its own.
  const [allEarnedBadges, setAllEarnedBadges] = useState<BadgeSummary[]>([]);
  const [selectedBadge, setSelectedBadge] = useState<BadgeSummary | null>(null);
  const [sharingBadge, setSharingBadge] = useState<BadgeSummary | null>(null);
  const [selectedStamp, setSelectedStamp] = useState<StampPreview | null>(null);
  const [avatarLightbox, setAvatarLightbox] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [rawVisits, setRawVisits] = useState<any[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(false);
  // Per-fetch success flags — sections show skeletons until their data has
  // actually arrived, so an offline/slow start never looks like an empty account
  const [visitsLoaded,  setVisitsLoaded]  = useState(false);
  const [badgesLoaded,  setBadgesLoaded]  = useState(false);
  const [friendsLoaded, setFriendsLoaded] = useState(false);

  // getToken from @clerk/clerk-expo is a new function every render — keeping it
  // in dep arrays re-triggers effects on each render and loops fetches forever.
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  // Re-pressing the Profile tab while already on it scrolls back to the top.
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);

  // The passport "card" on this screen is a hole, not a component — see the
  // render below and PassportBackdrop's own comment. Its rect: HOLE_TOP
  // from the screen top (at scroll 0), PASSPORT_CARD_INSET from the sides,
  // and as tall as the backdrop reports its card block to be.
  const HOLE_TOP = TOP_BAR_H + HOLE_TOP_PAD;
  const [holeH, setHoleH] = useState(0);
  // The cover's stat grid, relative to the hole — the closed card's stat
  // links are this screen's own transparent tap targets floated over the
  // hole at these positions (the hole's open-passport target underneath
  // would otherwise take every touch, and the backdrop can't own them
  // itself: dragging on the card has to scroll this page, so the touch has
  // to land inside this ScrollView). Only stored when actually different —
  // the backdrop re-reports on every layout pass.
  const [statsRect, setStatsRect] = useState<PassportStatsRect | null>(null);
  const handleStatsLayout = useCallback((r: PassportStatsRect) => {
    setStatsRect(prev =>
      prev && Math.abs(prev.x - r.x) < 0.5 && Math.abs(prev.y - r.y) < 0.5
        && Math.abs(prev.width - r.width) < 0.5 && Math.abs(prev.height - r.height) < 0.5
        ? prev : r,
    );
  }, []);
  // Native-driven scroll offset — the backdrop is shifted by -scrollY while
  // the passport is closed so its card block stays glued to the hole as
  // this page scrolls (the hole scrolls; the backdrop otherwise wouldn't).
  const scrollY = useRef(new Animated.Value(0)).current;
  const onProfileScroll = useMemo(
    () => Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true }),
    [scrollY],
  );

  // Pull-to-refresh spins its OWN native indicator — must not also swap the
  // whole page to the full-screen loading state (the `loading && !profile`
  // branch below), which is why this takes an isRefresh flag rather than
  // just reusing `loading` for both.
  const [refreshing, setRefreshing] = useState(false);
  const loadData = useCallback(async (isRefresh = false) => {
    const tok = await getTokenRef.current();
    if (!tok) { setLoading(false); setRefreshing(false); return; }
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(false);
    try {
      const [profRes, visitsRes, badgesRes, friendsRes] = await Promise.allSettled([
        apiFetch<ProfileInfo>('/api/profile', tok),
        apiFetch<any[]>('/api/visits', tok),
        apiFetch<{ badges: BadgeSummary[]; stats?: { parkScopes?: {
          national_park?: { visited: number; total: number };
          all?: { visited: number; total: number };
        } } }>('/api/badges', tok),
        apiFetch<any[]>(`/api/friends?userId=${user?.id}&type=friends`, tok),
      ]);

      if ([profRes, visitsRes, badgesRes, friendsRes].every(r => r.status === 'rejected')) {
        setError(true);
      }

      if (profRes.status === 'fulfilled')   setProfile(profRes.value);
      if (visitsRes.status === 'fulfilled') {
        const vs = visitsRes.value;
        setRawVisits(vs);
        setVisitsLoaded(true);
      }
      if (badgesRes.status === 'fulfilled') {
        const all = badgesRes.value.badges ?? [];
        const earned = all
          .filter((b: any) => b.earned)
          // Most recently earned first; badges with no timestamp sink to the end.
          .sort((a: any, b: any) => (b.earned_at ?? '').localeCompare(a.earned_at ?? ''));
        setBadgesEarned(earned.length);
        setTotalBadges(all.length);
        const npScope = badgesRes.value.stats?.parkScopes?.national_park;
        if (npScope) { setParksVisited(npScope.visited); setParksTotal(npScope.total); }
        const allScope = badgesRes.value.stats?.parkScopes?.all;
        if (allScope) setAreasVisited(allScope.visited);
        setEarnedBadges(earned.slice(0, 5));
        setAllEarnedBadges(earned);
        setBadgesLoaded(true);
      }
      if (friendsRes.status === 'fulfilled') {
        setFriendCount(Array.isArray(friendsRes.value) ? friendsRes.value.length : 0);
        setFriendsLoaded(true);
      }
    } catch (e) {
      console.error('Profile load error:', e);
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  const handleRefresh = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    loadData(true);
  }, [loadData]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  // null = identity not loaded yet (offline/slow) — show a skeleton, not "Explorer"
  const realName    = profile?.display_name || user?.fullName || user?.username || null;
  const displayName = realName ?? 'Explorer';
  const username    = profile?.username || user?.username || '';
  const avatarUrl   = profile?.avatar_url || user?.imageUrl || null;
  const joinDate    = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;
  const mapParks = useMemo(() => {
    const seen = new Set<string>();
    return rawVisits
      .filter((v: any) => {
        if (!v.latitude || !v.longitude || v.is_bucket_list || !v.visited_date) return false;
        if (seen.has(v.park_code)) return false;
        seen.add(v.park_code);
        return true;
      })
      .map((v: any) => ({
        park_code: v.park_code,
        name: v.park_name,
        lat: parseFloat(v.latitude),
        lng: parseFloat(v.longitude),
      }))
      .filter((p: any) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  }, [rawVisits]);

  const mapRegion = useMemo(() => {
    if (mapParks.length === 0) return undefined;
    const lats = mapParks.map(p => p.lat);
    const lngs = mapParks.map(p => p.lng);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max((maxLat - minLat) * 1.5, 4),
      longitudeDelta: Math.max((maxLng - minLng) * 1.5, 6),
    };
  }, [mapParks]);

  // Most recently earned stamps first. A stamp is earned by the FIRST visit
  // to a park, so dedupe keeps the earliest visit per park — the old
  // last-write-wins dedupe kept whichever visit the API happened to return
  // last, which scrambled the order for re-visited parks. colorIdx =
  // chronological index so colors match the passport screen.
  const recentStamps = useMemo((): StampPreview[] => {
    const byPark = new Map<string, any>();
    rawVisits.forEach((v: any) => {
      if (v.is_bucket_list || !v.visited_date) return;
      const cur = byPark.get(v.park_code);
      if (!cur || v.visited_date.localeCompare(cur.visited_date) < 0) byPark.set(v.park_code, v);
    });
    return [...byPark.values()]
      .sort((a, b) => (a.visited_date ?? '').localeCompare(b.visited_date ?? ''))
      .map((v, idx) => ({
        park_code: v.park_code,
        name: v.park_name ?? v.park_code,
        states: v.states ?? '',
        colorIdx: idx,
        stamp_glyph: v.stamp_glyph ?? null,
        visited_date: v.visited_date ?? null,
      }))
      .slice(-5)
      .reverse();
  }, [rawVisits]);

  // Passport card's share button → the pre-share/export screen (image
  // preview + destinations), same flow the full passport screen opens.
  const handleShare = () => router.push('/passport-share' as never);

  // Invite flow — /download is a short marketing redirect to the App Store
  // listing (see apps/web next.config.ts), not a profile deep link, since
  // the recipient doesn't have the app installed yet.
  const handleInviteFriend = async () => {
    try {
      await Share.share({
        message: `I've been using ParkQuest to log and share my national park trips — you should check it out! https://parkquest.me/download`,
      });
    } catch {
      // user dismissed the share sheet
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out', style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/(auth)/sign-in' as never);
        },
      },
    ]);
  };

  // MRZ-style bottom strip — encodes real user data in passport MRZ format
  const mrzLine1 = (() => {
    const parts = displayName.toUpperCase().replace(/[^A-Z ]/g, '').split(' ');
    const surname = (parts[0] ?? 'UNKNOWN').slice(0, 12);
    const given = (parts.slice(1).join('<') || 'EXPLORER').slice(0, 10);
    const raw = `P<USA<<${surname}<<${given}`;
    return raw.padEnd(44, '<').slice(0, 44);
  })();

  const mrzLine2 = (() => {
    const uid = user?.id?.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(-7).padStart(7, '0') ?? '0000000';
    const joined = user?.createdAt
      ? new Date(user.createdAt).toISOString().slice(2, 10).replace(/-/g, '')
      : '000000';
    const parks3 = String(parksVisited).padStart(3, '0');
    const uname = username.toUpperCase().slice(0, 9).padEnd(9, '<');
    const raw = `${uid}<USA${joined}${parks3}${uname}`;
    return raw.padEnd(44, '<').slice(0, 44);
  })();

  // Tapping the passport card (or any of its "see more" affordances) no
  // longer navigates anywhere or mounts a new component — the full passport
  // (<PassportBackdrop>, cover + stamp grid + badges) is ALREADY rendered,
  // permanently, behind this screen's own foreground (see the render below)
  // — it never resizes, fades, or remounts itself. "Opening" is this
  // screen's own foreground (the top bar + the page, i.e. the frame around
  // the hole the cover shows through) scaling up past the edges of the
  // screen, so the hole widens and uncovers the backdrop that was sitting
  // there unchanged the whole time. Closing just reverses that.
  const [passportOpen, setPassportOpen] = useState(false);
  const passportForeground = useRef(new Animated.Value(0)).current;

  const openPassport = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    // The zoom's pivot (pageZoomStyle, below) is a FIXED content-local Y —
    // where the hole sits at scroll 0 — not a screen position, so it only
    // lines up with the actual on-screen hole when this page is scrolled to
    // the top. "Passport" under My Collection sits well below the fold, so
    // opening it (this was the broken link) zoomed from a pivot that was
    // off-screen above the viewport: the transition looked like a jump-cut
    // instead of the card growing open. Scroll home first, same fix
    // PassportBackdrop's own requestClose uses for the reverse case.
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    setPassportOpen(true);
    Animated.timing(passportForeground, {
      toValue: 1, duration: 380, easing: Easing.in(Easing.cubic), useNativeDriver: true,
    }).start();
  }, [passportForeground]);

  const closePassport = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Animated.timing(passportForeground, {
      toValue: 0, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start(() => setPassportOpen(false));
  }, [passportForeground]);

  // Floating glass top bar — duplicated from the feed screen's header
  // (same wordmark + notification/search/settings actions, same
  // blur/glass fill and safe-area math) so both tabs match exactly.
  const topBarActions = (
    <View style={styles.topBarActions}>
      <NotificationBell style={styles.iconBtn} />
      <TouchableOpacity
        style={styles.iconBtn}
        activeOpacity={0.8}
        onPress={() => setSearchOpen(true)}
      >
        <GlassIconBg />
        <Ionicons name="search" size={22} color={C.inkSoft} />
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.iconBtn}
        activeOpacity={0.8}
        onPress={() => router.push('/profile/edit' as never)}
      >
        <GlassIconBg />
        <Ionicons name="settings-outline" size={22} color={C.inkSoft} />
      </TouchableOpacity>
    </View>
  );

  const topBar = (
    <View style={[styles.topBar, { height: TOP_BAR_H }]}>
      {barGlass && GlassView && GlassContainer ? (
        <GlassContainer style={StyleSheet.absoluteFill}>
          <GlassView style={StyleSheet.absoluteFill} glassEffectStyle="regular" tintColor={isDark ? '#171511' : '#F2EBDB'} />
          {/* Fades the glass tint to fully transparent by the bar's own
              bottom edge — same height, no hard cutoff */}
          <LinearGradient
            pointerEvents="none"
            colors={isDark
              ? ['rgba(23,21,17,0.5)', 'rgba(23,21,17,0.22)', 'rgba(23,21,17,0)']
              : ['rgba(242,235,219,0.5)', 'rgba(242,235,219,0.22)', 'rgba(242,235,219,0)']}
            locations={[0, 0.55, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.topBarInner, { marginTop: insets.top - 8 }]}>
            <View style={{ height: 44, justifyContent: 'center' }}>
              <Wordmark onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })} />
            </View>
            {topBarActions}
          </View>
        </GlassContainer>
      ) : (
        <>
          {/* Blur + tint that both dissolve toward the bar's bottom edge —
              no hard line where the blur stops. Shared with the feed tab. */}
          <HeaderBlurFade isDark={isDark} />
          <View style={[styles.topBarInner, { marginTop: insets.top - 8 }]}>
            <View style={{ height: 44, justifyContent: 'center' }}>
              <Wordmark onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })} />
            </View>
            {topBarActions}
          </View>
        </>
      )}
    </View>
  );

  if (loading && !profile) {
    return (
      <View style={styles.screen}>
        <View style={{ flex: 1, marginTop: TOP_BAR_H, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
        {topBar}
      </View>
    );
  }

  if (error && !profile) {
    return (
      <View style={styles.screen}>
        <View style={{ flex: 1, marginTop: TOP_BAR_H, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <Ionicons name="cloud-offline-outline" size={36} color={C.inkMute} />
          <Text style={{ color: C.inkMute, fontSize: 15, fontWeight: '600' }}>Failed to load</Text>
          <TouchableOpacity
            onPress={() => loadData()}
            style={{ paddingHorizontal: 20, paddingVertical: 10, backgroundColor: C.primary, borderRadius: 12 }}
          >
            <Text style={{ color: '#FFFBF1', fontWeight: '700', fontSize: 14 }}>Retry</Text>
          </TouchableOpacity>
        </View>
        {topBar}
      </View>
    );
  }

  // Pure scale, no fade — the page's frame (the hole's surround and
  // everything below it) grows past the screen edges, so the hole simply
  // widens, uncovering more of the backdrop that was always there; nothing
  // dissolves. Pivoted at the hole's center (transformOrigin, relative to
  // each wrapper's own box — both the scroll content and the top bar
  // wrapper start at screen y=0, so they share this one pivot) so the page
  // expands outward FROM the passport specifically.
  const zoomScale = passportForeground.interpolate({ inputRange: [0, 1], outputRange: [1, 3] });
  const pageZoomStyle = {
    transform: [{ scale: zoomScale }],
    transformOrigin: ['50%', HOLE_TOP + holeH / 2, 0] as [string, number, number],
  };
  // -scrollY while closed (backdrop rides with the hole as this page
  // scrolls), easing to 0 as the passport opens so the cover settles into
  // its own resting place on the open page.
  const backdropShift = Animated.multiply(scrollY, Animated.subtract(passportForeground, 1));

  // The frame extends HOLE_TOP_PAD past the hole's bottom (rather than the
  // section below carrying that gap as paddingTop) so the hole's bottom
  // edge never sits on a view boundary — with a fractional holeH, that
  // seam let a hairline of the dark backdrop show under the card.
  // Ceiled: holeH is a measured (fractional) height, and a fractional
  // FRAME_H put the frame's bottom edge on a sub-pixel boundary — the SVG
  // rect anti-aliased its last row to partial alpha while the cream section
  // below snapped to the pixel grid, leaving a 1px dark seam of backdrop
  // showing through as a full-width black line under the card.
  const FRAME_H = Math.ceil(HOLE_TOP + holeH + HOLE_TOP_PAD);
  const framePaths = frameHolePath(FRAME_H, HOLE_TOP, holeH);

  return (
    <View style={styles.screen}>
      {/* Permanently mounted, never resized/remounted, and the ONLY place
          the passport cover is drawn — this screen's own "card" is a hole
          cut in the page below that shows this through. See
          PassportBackdrop's own comment. */}
      <PassportBackdrop
        active={passportOpen}
        onRequestClose={closePassport}
        holeTop={HOLE_TOP}
        shiftY={backdropShift}
        onCardHeight={setHoleH}
        onStatsLayout={handleStatsLayout}
        onAvatarPress={() => setAvatarLightbox(true)}
        getToken={getToken}
        rawVisits={rawVisits}
        earnedBadges={allEarnedBadges}
        profile={{ avatarUrl, name: realName, username, joinDate, bio: profile?.bio ?? null }}
        stats={{ parksVisited, parksTotal, areasVisited, badgesEarned, friendCount }}
        badgesLoaded={badgesLoaded}
        friendsLoaded={friendsLoaded}
        mrzLine1={mrzLine1}
        mrzLine2={mrzLine2}
        isDark={isDark}
      />

      {/* This screen's own foreground. Everything here scales up
          (pageZoomStyle) and clears off past the screen edges on open,
          uncovering the backdrop above instead of the backdrop animating
          itself into view. pointerEvents 'none' once open so touches fall
          through to the (by then fully visible) backdrop. No background of
          its own anywhere above the hole — that's what lets the backdrop
          show through it. */}
      <Animated.View style={{ flex: 1 }} pointerEvents={passportOpen ? 'none' : 'auto'}>
      <Animated.ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        onScroll={onProfileScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: tabBarSpace + 16 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={C.primary}
            // The floating top bar overlaps content now (it blurs what
            // scrolls under it) — without this the spinner sits hidden
            // behind it, same fix as the feed tab's own pull-to-refresh.
            progressViewOffset={TOP_BAR_H}
          />
        }
      >
        <Animated.View style={pageZoomStyle}>

        {/* ── The passport "card": a rounded hole in the page's cream frame,
            through which the backdrop's cover shows. The frame runs from
            the very top of the content (under the floating top bar — so
            behind the bar's blur there's cream, not the backdrop) down to
            the hole's bottom edge; the section below continues the cream. */}
        <View style={{ height: FRAME_H }} pointerEvents="box-none">
          {/* Drawn 1pt taller than its box so the frame overlaps under the
              opaque section below (a later sibling, so it paints on top) —
              no exposed edge row between the two for the backdrop to bleed
              through, whatever the pixel rounding does. */}
          <Svg width={SCREEN_W} height={FRAME_H + 1} style={{ position: 'absolute', top: 0, left: 0 }} pointerEvents="none">
            <Path d={framePaths.frame} fill={colorStr(C.bg)} fillRule="evenodd" />
            {framePaths.hole && (
              <Path d={framePaths.hole} fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth={0.5} />
            )}
          </Svg>
          {/* Tap anywhere on the card to open it (the backdrop's own
              stat/avatar taps take over once it's open). Transparent — the
              content it sits over is the backdrop's, not its own. */}
          <TouchableOpacity
            style={{ position: 'absolute', left: PASSPORT_CARD_INSET, top: HOLE_TOP, width: PASSPORT_CARD_W, height: holeH }}
            onPress={openPassport}
            activeOpacity={1}
          />
          {/* Stat links on the closed card (see statsRect) — later siblings
              of the hole target above, so they win the touch. Stats with no
              link of their own get no target: the tap falls through to the
              hole and opens the passport, same as tapping anywhere else. */}
          {statsRect && passportStatHitRects(statsRect).map((r, i) => {
            const href = PASSPORT_STAT_LINKS[i];
            if (!href) return null;
            return (
              <TouchableOpacity
                // Index, not href — VISITED and NPS AREAS intentionally
                // both link to /profile/journal (two views of the same
                // visit log), so href alone isn't a unique key here.
                key={i}
                style={{ position: 'absolute', left: PASSPORT_CARD_INSET + r.left, top: HOLE_TOP + r.top, width: r.width, height: r.height }}
                onPress={() => router.push(href as never)}
                activeOpacity={1}
                hitSlop={4}
              />
            );
          })}
          {/* Share profile — top-right corner of the card */}
          <TouchableOpacity
            style={[styles.shareBtn, { top: HOLE_TOP + 34 }]}
            activeOpacity={0.7}
            onPress={handleShare}
            hitSlop={8}
          >
            <Ionicons name="share-outline" size={16} color={GOLD} />
          </TouchableOpacity>
        </View>

        {/* Everything below the card — plain opaque cream, continuing the
            frame (which already carries the gap under the hole); zooms with it. */}
        <View style={{ backgroundColor: C.bg }}>

        {/* "Tap to expand" — a labeled rule the width of the card, sitting
            in the frame's gap just under it (negative marginTop pulls it up
            into that gap; the frame is cream too, so there's no seam). Taps
            open the passport like the card does. */}
        <TouchableOpacity style={styles.expandHint} onPress={openPassport} activeOpacity={0.6} hitSlop={8}>
          <View style={styles.expandHintRule} />
          <Text style={styles.expandHintText}>TAP TO EXPAND</Text>
          <View style={styles.expandHintRule} />
        </TouchableOpacity>

        {/* ── Recent stamps preview — skeleton until visits load, hidden only when truly empty ── */}
        {(!visitsLoaded || recentStamps.length > 0) && (
          <View style={styles.badgesPreview}>
            <TouchableOpacity
              onPress={openPassport}
              hitSlop={10}
              style={styles.sectionHeader}
              activeOpacity={0.6}
            >
              <Ionicons name="book-outline" size={13} color={C.primary} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Text style={[styles.sectionKicker, { color: C.primary }]}>RECENT STAMPS</Text>
                <Ionicons name="chevron-forward" size={16} color={C.primary} />
              </View>
            </TouchableOpacity>
            {!visitsLoaded ? <PreviewSkeleton /> : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 4 }}>
              {recentStamps.map(s => (
                <TouchableOpacity
                  key={s.park_code}
                  onPress={() => setSelectedStamp(s)}
                  activeOpacity={0.7}
                  style={styles.badgePreviewItem}
                >
                  <View style={{ marginBottom: 6 }}>
                    <ParkStamp
                      parkCode={s.park_code}
                      name={s.name}
                      states={s.states}
                      colorIdx={s.colorIdx}
                      size={52}
                      idSuffix="-profile"
                      customGlyph={s.stamp_glyph}
                      dark={isDark}
                    />
                  </View>
                  <Text style={styles.badgePreviewName} numberOfLines={2}>{s.name}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                onPress={openPassport}
                style={styles.badgePreviewItem}
                activeOpacity={0.7}
              >
                <Svg width={52} height={52} viewBox="0 0 52 52" style={{ marginBottom: 6 }}>
                  <Circle
                    cx={26} cy={26} r={25.5}
                    fill="none"
                    stroke={C.primary}
                    strokeWidth={1}
                    strokeDasharray="3 2.5"
                  />
                  <SvgText
                    x={26} y={19.5}
                    textAnchor="middle"
                    alignmentBaseline="central"
                    fill={C.primary}
                    fontSize={9.5}
                    fontWeight="800"
                    letterSpacing={0.6}
                  >SEE</SvgText>
                  <SvgText
                    x={26} y={32.5}
                    textAnchor="middle"
                    alignmentBaseline="central"
                    fill={C.primary}
                    fontSize={9.5}
                    fontWeight="800"
                    letterSpacing={0.6}
                  >ALL</SvgText>
                </Svg>
                <Text style={[styles.badgePreviewName, { color: C.primary }]} numberOfLines={2}>All Stamps</Text>
              </TouchableOpacity>
            </ScrollView>
            )}
          </View>
        )}

        {/* ── Earned badges preview — skeleton until badges load, hidden only when truly empty ── */}
        {(!badgesLoaded || earnedBadges.length > 0) && (
          <View style={styles.badgesPreview}>
            <TouchableOpacity
              onPress={() => router.push('/profile/badges' as never)}
              hitSlop={10}
              style={styles.sectionHeader}
              activeOpacity={0.6}
            >
              <Ionicons name="ribbon-outline" size={13} color={C.primary} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Text style={[styles.sectionKicker, { color: C.primary }]}>RECENT BADGES</Text>
                <Ionicons name="chevron-forward" size={16} color={C.primary} />
              </View>
            </TouchableOpacity>
            {!badgesLoaded ? <PreviewSkeleton /> : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 4 }}>
              {earnedBadges.map(b => (
                <TouchableOpacity
                  key={b.id}
                  onPress={() => setSelectedBadge(b)}
                  activeOpacity={0.7}
                  style={styles.badgePreviewItem}
                >
                  <View style={{ marginBottom: 6 }}>
                    <BadgePatch emoji={b.emoji} tier={b.tier} colors={b.colors} size={52} earned />
                  </View>
                  <Text style={styles.badgePreviewName} numberOfLines={2}>{b.name}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                onPress={() => router.push('/profile/badges' as never)}
                style={styles.badgePreviewItem}
                activeOpacity={0.7}
              >
                <Svg width={52} height={52} viewBox="0 0 52 52" style={{ marginBottom: 6 }}>
                  <Circle
                    cx={26} cy={26} r={25.5}
                    fill="none"
                    stroke={C.primary}
                    strokeWidth={1}
                    strokeDasharray="3 2.5"
                  />
                  <SvgText
                    x={26} y={19.5}
                    textAnchor="middle"
                    alignmentBaseline="central"
                    fill={C.primary}
                    fontSize={9.5}
                    fontWeight="800"
                    letterSpacing={0.6}
                  >SEE</SvgText>
                  <SvgText
                    x={26} y={32.5}
                    textAnchor="middle"
                    alignmentBaseline="central"
                    fill={C.primary}
                    fontSize={9.5}
                    fontWeight="800"
                    letterSpacing={0.6}
                  >ALL</SvgText>
                </Svg>
                <Text style={[styles.badgePreviewName, { color: C.primary }]} numberOfLines={2}>All Badges</Text>
              </TouchableOpacity>
            </ScrollView>
            )}
          </View>
        )}

        {/* ── Visited parks map ────────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="map-outline" size={13} color={C.inkMute} />
            <Text style={styles.sectionKicker}>VISITED PARKS</Text>
          </View>
          <TouchableOpacity
            style={styles.mapCard}
            activeOpacity={0.85}
            onPress={() => router.push('/(tabs)/map' as never)}
          >
            {mapParks.length > 0 ? (
              <MapView
                style={{ width: '100%', height: 200, borderRadius: 14 }}
                provider={PROVIDER_DEFAULT}
                initialRegion={mapRegion}
                rotateEnabled={false}
                pitchEnabled={false}
                scrollEnabled={false}
                zoomEnabled={false}
                toolbarEnabled={false}
                pointerEvents="none"
              >
                {mapParks.map(p => (
                  <Marker
                    key={p.park_code}
                    coordinate={{ latitude: p.lat, longitude: p.lng }}
                    tracksViewChanges={false}
                  >
                    <View style={styles.markerDot} />
                  </Marker>
                ))}
              </MapView>
            ) : visitsLoaded ? (
              <View style={styles.mapEmpty}>
                <EmptyState
                  icon="map-outline"
                  title="No park visits yet"
                  action={{
                    label: 'Add a visit',
                    // Nested TouchableOpacity — claims the touch itself, so this
                    // doesn't also trigger the card's own onPress (which pushes
                    // to the full map view).
                    onPress: () => router.push('/(modals)/log-visit' as never),
                  }}
                />
              </View>
            ) : (
              <View style={styles.mapEmpty}>
                <ActivityIndicator size="small" color={C.inkMute} />
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* ── My collection nav rows ───────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="grid-outline" size={13} color={C.inkMute} />
            <Text style={styles.sectionKicker}>MY COLLECTION</Text>
          </View>
          <View style={styles.card}>
            <NavRow
              icon="ribbon-outline"
              label="Badges"
              subtitle="Achievements and milestones"
              count={badgesEarned > 0 ? badgesEarned : undefined}
              onPress={() => router.push('/profile/badges' as never)}
            />
            <View style={styles.rowDivider} />
            <NavRow
              icon="journal-outline"
              label="Visits"
              subtitle="Every park you've logged"
              count={parksVisited > 0 ? parksVisited : undefined}
              onPress={() => router.push('/profile/journal' as never)}
            />
            <View style={styles.rowDivider} />
            <NavRow
              icon="book-outline"
              label="Passport"
              subtitle="Stamps from every visit"
              count={parksVisited > 0 ? parksVisited : undefined}
              onPress={openPassport}
            />
            <View style={styles.rowDivider} />
            <NavRow
              icon="people-outline"
              label="Friends"
              subtitle="People exploring with you"
              count={friendCount > 0 ? friendCount : undefined}
              onPress={() => router.push('/profile/friends' as never)}
            />
          </View>
        </View>

        {/* ── Support ───────────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="heart-outline" size={13} color={C.inkMute} />
            <Text style={styles.sectionKicker}>SUPPORT PARKQUEST</Text>
          </View>
          <View style={styles.card}>
            <NavRow
              icon="share-social-outline"
              label="Invite a friend"
              subtitle="Share the ParkQuest download link"
              onPress={handleInviteFriend}
            />
            <View style={styles.rowDivider} />
            <NavRow
              icon="chatbox-ellipses-outline"
              label="Send feedback"
              onPress={() => setFeedbackOpen(true)}
            />
          </View>
        </View>

        {/* ── Account settings ─────────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="person-outline" size={13} color={C.inkMute} />
            <Text style={styles.sectionKicker}>ACCOUNT</Text>
          </View>
          <View style={styles.card}>
            <NavRow
              icon="settings-outline"
              label="Settings"
              onPress={() => router.push('/profile/edit' as never)}
            />
            <View style={styles.rowDivider} />
            <NavRow
              icon="log-out-outline"
              label="Sign Out"
              danger
              onPress={handleSignOut}
            />
          </View>
        </View>

        {user?.publicMetadata?.role === 'admin' && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="shield-outline" size={13} color={C.inkMute} />
              <Text style={styles.sectionKicker}>ADMIN</Text>
            </View>
            <View style={styles.card}>
              <NavRow
                icon="analytics-outline"
                label="Admin Dashboard"
                subtitle=""
                onPress={() => router.push('/admin' as never)}
              />
            </View>
          </View>
        )}

        {/* Attribution */}
        <Text style={styles.attribution}>
          © {new Date().getFullYear()}{' '}
          <Text
            style={{ fontWeight: '600', textDecorationLine: 'underline' }}
            onPress={() => Linking.openURL('https://parkquest.me')}
            suppressHighlighting
          >
            ParkQuest
          </Text>
          {' '}· Track your national park adventures
        </Text>
        </View>
        </Animated.View>
      </Animated.ScrollView>

      <Animated.View style={[StyleSheet.absoluteFillObject, pageZoomStyle]} pointerEvents="box-none">
        {topBar}
      </Animated.View>

      {selectedBadge ? (
        <BadgeDetailModal
          badge={selectedBadge}
          onClose={() => setSelectedBadge(null)}
          onShare={() => { setSharingBadge(selectedBadge); setSelectedBadge(null); }}
        />
      ) : null}

      {sharingBadge ? (
        <BadgeShareSheet badge={sharingBadge} onClose={() => setSharingBadge(null)} />
      ) : null}

      {selectedStamp ? (
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
      ) : null}

      <SearchOverlay visible={searchOpen} onClose={() => setSearchOpen(false)} />

      {feedbackOpen ? (
        <FeedbackSheet onClose={() => setFeedbackOpen(false)} />
      ) : null}
      </Animated.View>

      {/* Outside the foreground wrapper — the backdrop's own avatar (the
          only avatar there is) opens this too, and while the passport is
          open the foreground is pointerEvents 'none'. */}
      <AvatarLightbox visible={avatarLightbox} url={avatarUrl} onClose={() => setAvatarLightbox(false)} />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },

  // Passport card — everything visual about it (pattern, avatar, name,
  // stats, MRZ, watermark) lives in PassportBackdrop; this screen only cuts
  // the hole (see frameHolePath) and floats this one button over it.
  expandHint: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: PASSPORT_CARD_INSET,
    // HOLE_TOP_PAD (20) of cream frame sits between the hole and this
    // section — pull up into it so the hint reads as the card's caption,
    // not the next section's header.
    marginTop: -HOLE_TOP_PAD + 8,
    marginBottom: 18,
  },
  expandHintRule: { flex: 1, height: 0.5, backgroundColor: C.hairline },
  expandHintText: { fontSize: 10, fontWeight: '700', letterSpacing: 1.4, color: C.inkMute },
  shareBtn: {
    // Deliberately smaller than the app-wide 44pt round buttons — it's a
    // quiet corner affordance on the passport card, not primary chrome.
    // `top` is set inline (relative to the hole's measured position).
    position: 'absolute', right: PASSPORT_CARD_INSET + 16, zIndex: 2,
    width: 34, height: 34, borderRadius: 17,
    overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(201,169,74,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },

  // Badges preview
  badgesPreview: {
    marginBottom: 20, paddingLeft: 16,
  },

  badgePreviewItem: {
    alignItems: 'center', width: 70,
  },
  badgePreviewName: {
    fontSize: 13, fontWeight: '600', color: C.ink, textAlign: 'center', lineHeight: 13,
  },

  // Sections
  section: {
    marginHorizontal: 16, marginBottom: 20,
  },
  sectionHeader: {
    marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  sectionKicker: {
    fontSize: 13, fontWeight: '700', color: C.inkMute, letterSpacing: 1.4, textTransform: 'uppercase',
  },
  sectionTitle: {
    fontSize: 17, fontWeight: '800', color: C.ink, letterSpacing: -0.2, marginTop: 2,
  },
  card: {
    backgroundColor: C.surface, borderRadius: 14,
    borderWidth: 0.5, borderColor: C.hairline, overflow: 'hidden',
  },

  // Nav row
  navRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  navIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  navLabel: {
    fontSize: 14, fontWeight: '700', color: C.ink, marginBottom: 1,
  },
  navSub: {
    fontSize: 13, color: C.inkMute,
  },
  navCount: {
    backgroundColor: C.surfaceAlt, borderRadius: 100,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  navCountText: {
    fontSize: 13, fontWeight: '700', color: C.inkSoft,
  },
  rowDivider: {
    height: 0.5, backgroundColor: C.hairline, marginLeft: 66,
  },

  // Map
  mapCard: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: C.hairline,
    backgroundColor: '#CECDBC',
  },
  mapEmpty: {
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.surface,
    borderRadius: 14,
  },
  mapEmptyText: {
    fontSize: 13,
    color: C.inkMute,
  },
  markerDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: C.visited,
    borderWidth: 2,
    borderColor: C.onPrimary,
  },

  // Loading skeletons
  skeletonCircle: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: dyn('rgba(27,26,22,0.08)', 'rgba(240,234,217,0.10)'), marginBottom: 6,
  },
  skeletonLine: {
    width: 48, height: 9, borderRadius: 5,
    backgroundColor: dyn('rgba(27,26,22,0.06)', 'rgba(240,234,217,0.07)'),
  },

  // Attribution
  attribution: {
    textAlign: 'center', fontSize: 13, color: C.inkMute,
    marginTop: 24, marginHorizontal: 16,
  },

  // Floating glass top bar — duplicated verbatim from the feed screen.
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    overflow: 'hidden',
  },
  topBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 8,
  },
  topBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    // 44pt — the app-wide round icon button size (matches the park page
    // header buttons).
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: C.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
