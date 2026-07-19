import {
  ActivityIndicator, Animated, Dimensions, FlatList, Image, Linking, Modal,
  PanResponder, Pressable, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View,
  useColorScheme,
  type ColorValue, type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { BlurView } from 'expo-blur';

// Lets RN Animated drive the blur's `intensity` prop (JS driver — see the
// scroll listener's blurAnim note).
const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);
import { useAuth, useUser } from '@clerk/clerk-expo';
import { PostCard, type FeedPost } from '@/components/PostCard';
import { MenuView } from '@react-native-menu/menu';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { distanceMiles } from '@/lib/location';
import { GlassIconBg } from '@/components/GlassIconBg';
import { GrowTouchable } from '@/components/GrowTouchable';
import { liquidGlassAvailable } from '@/lib/glass';
import { fullStateName } from '@/lib/stateNames';
import { STATIC as C, useColors, colorStr } from '@/lib/palette';
import { parkColor, parkGradient } from '@/lib/parkColors';
import { ImageLightbox } from '@/components/ImageLightbox';
import { FriendsVisitedSheet } from '@/components/FriendsVisitedSheet';
import { VisitPickerSheet } from '@/components/VisitPickerSheet';
import { OfflineBanner } from '@/components/OfflineBanner';
import { Avatar } from '@/components/Avatar';
import { useIsOnline } from '@/lib/network';
import type { ParkDetail, NpsData, NpsImage, ParkVisitorsSummary } from '@/lib/api';
import { loadOfflineParks, loadOfflineParksNps } from '@/lib/offlineParks';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
const SW = Dimensions.get('window').width;

// Local luminance of an image at a normalized (x, y) point, decoded from a
// spatial blurhash by evaluating the full DCT — no pixel access and no new
// dependencies. Lets each header button pick its ink from the region of the
// cover actually behind it instead of the whole-image average (a bright sky
// on the right shouldn't force dark ink on a button over dark trees on the
// left). Positions are approximate — the hash is in source-image space and
// the hero is cover-cropped — but blurhash is so low-pass it doesn't matter.
const B83 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~';
function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}
function linearToSrgb(v: number): number {
  const c = Math.max(0, Math.min(1, v));
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}
function blurhashLumaAt(hash: string, x: number, y: number): number {
  const b83 = (s: string) => { let v = 0; for (const ch of s) v = v * 83 + B83.indexOf(ch); return v; };
  const sizeFlag = B83.indexOf(hash[0]);
  const numX = (sizeFlag % 9) + 1;
  const numY = Math.floor(sizeFlag / 9) + 1;
  const maxAc = (B83.indexOf(hash[1]) + 1) / 166;
  // AC values are quantized to 19 levels per channel with a signed-square curve
  const ac = (q: number) => { const t = (q - 9) / 9; return Math.sign(t) * t * t * maxAc; };
  let r = 0, g = 0, b = 0;
  for (let j = 0; j < numY; j++) {
    for (let i = 0; i < numX; i++) {
      const basis = Math.cos(Math.PI * i * x) * Math.cos(Math.PI * j * y);
      const idx = i + j * numX;
      if (idx === 0) {
        const v = b83(hash.slice(2, 6));
        r += srgbToLinear((v >> 16) & 255) * basis;
        g += srgbToLinear((v >> 8) & 255) * basis;
        b += srgbToLinear(v & 255) * basis;
      } else {
        const v = b83(hash.slice(4 + idx * 2, 6 + idx * 2));
        r += ac(Math.floor(v / 361)) * basis;
        g += ac(Math.floor(v / 19) % 19) * basis;
        b += ac(v % 19) * basis;
      }
    }
  }
  return 0.299 * linearToSrgb(r) + 0.587 * linearToSrgb(g) + 0.114 * linearToSrgb(b);
}

// Hero collapses from this height down to this as the page scrolls, and
// stretches taller than this on overscroll (see the hero interpolations).
// HERO_MIN was 56 (the map sheet's COLLAPSED_H) but that left only 4pt of
// image below the 44pt header buttons (which end at insets.top + 52) —
// 68 gives the locked strip 16pt of breathing room under them.
const HERO_MAX = 320;
const HERO_MIN = 60;

// ── Types ─────────────────────────────────────────────────────────────────────

// Same shape as the base parks list (lib/api.ts's ParkDetail) — kept as a local
// alias since this file refers to it as `Park` throughout.
type Park = ParkDetail;

interface Visit {
  id: number;
  park_code: string;
  is_bucket_list: boolean;
  visited_date: string | null;
  end_date: string | null;
  title: string | null;
  notes: string | null;
  highlight: string | null;
  rating: number | null;
  crowd: number | null;
  difficulty: number | null;
  weather_conditions: string[] | null;
  activities: string[] | null;
  companions: string[] | null;
  photos: string[] | null;
  cover_photo: string | null;
  visibility: string | null;
  created_at: string;
}

interface PostLite {
  id: number;
  caption: string | null;
  photos: string[] | null;
  park_code: string | null;
  visit_id: number | null;
  badge_id: string | null;
  created_at: string;
  clerk_user_id: string;
  park_name: string | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
}

interface ForecastPeriod {
  name: string;
  startTime: string;
  temperature: number;
  temperatureUnit: string;
  shortForecast: string;
  icon: string;
  windSpeed: string;
  windDirection: string;
  isDaytime: boolean;
}

interface WeatherForecast {
  periods: ForecastPeriod[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function dayLabel(period: ForecastPeriod): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const periodDate = new Date(period.startTime);
  periodDate.setHours(0, 0, 0, 0);
  const diffDays = Math.round((periodDate.getTime() - today.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  return period.name.replace('This ', '');
}

function weatherEmoji(shortForecast: string): string {
  const f = shortForecast.toLowerCase();
  if (f.includes('thunder') || f.includes('storm'))    return '⛈️';
  if (f.includes('snow') && f.includes('rain'))         return '🌨️';
  if (f.includes('heavy snow'))                         return '❄️';
  if (f.includes('snow'))                               return '❄️';
  if (f.includes('heavy rain') || f.includes('showers')) return '🌧️';
  if (f.includes('rain') || f.includes('drizzle'))     return '🌦️';
  if (f.includes('fog') || f.includes('haze'))         return '🌫️';
  if (f.includes('windy') || f.includes('breezy'))     return '🌬️';
  if (f.includes('partly cloudy') || f.includes('partly sunny')) return '⛅';
  if (f.includes('mostly cloudy'))                      return '🌥️';
  if (f.includes('cloud') || f.includes('overcast'))   return '☁️';
  if (f.includes('sunny') || f.includes('clear'))      return '☀️';
  return '🌤️';
}

async function apiFetch<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Carries the park's name/states/image along so the log-visit modal can render its
// "Where" banner filled in on the first frame, instead of waiting on its own /api/parks fetch.
function logVisitParams(park: { park_code: string; name: string; states: string; image_url?: string | null }) {
  return { parkCode: park.park_code, parkName: park.name, parkStates: park.states, parkImageUrl: park.image_url ?? '' };
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const C = useColors();
  const [open, setOpen] = useState(true);
  // LayoutAnimation.configureNext (tried first) only reliably animates the
  // chevron's own transform update — under the New Architecture / Fabric,
  // it's a well-known gap that LayoutAnimation doesn't animate layout shifts
  // caused by a child actually mounting/unmounting, which is exactly what
  // `{open && children}` was doing. So: children stay permanently mounted
  // (never conditionally removed) inside a clipped Animated.View whose
  // height is driven by hand instead, between 0 and the content's own
  // measured height — that's a real Animated.timing on an actual layout
  // property, which always animates regardless of architecture.
  const [contentHeight, setContentHeight] = useState(0);
  const anim = useRef(new Animated.Value(1)).current;
  const toggle = () => {
    const next = !open;
    Animated.timing(anim, { toValue: next ? 1 : 0, duration: 300, useNativeDriver: false }).start();
    setOpen(next);
  };
  return (
    <View style={styles.section}>
      <TouchableOpacity
        onPress={toggle}
        activeOpacity={0.6}
        style={styles.sectionHeader}
      >
        <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>{title}</Text>
        <Animated.View
          style={{
            transform: [{
              rotate: anim.interpolate({ inputRange: [0, 1], outputRange: ['-90deg', '0deg'] }),
            }],
          }}
        >
          <Ionicons name="chevron-down" size={16} color={C.inkMute} />
        </Animated.View>
      </TouchableOpacity>

      {/* Was a conditional marginBottom on the header, toggled instantly by
          `open` while the content below was still 300ms into shrinking —
          the gap vanished immediately but the (still tall) content didn't,
          so it visibly crowded/overlapped the header for the rest of the
          animation. An animated spacer in step with `anim` closes in time
          with the content instead of snapping ahead of it. */}
      <Animated.View style={{ height: anim.interpolate({ inputRange: [0, 1], outputRange: [0, 12] }) }} />

      {/* Invisible, always-natural-size probe — measures content height
          without ever being inside the animated/clipped container below.
          That matters: this container's own height is mid-animation-driven,
          and letting the *visible* copy's onLayout report back during its
          own collapse was capturing transient near-zero readings (Fabric
          propagates the shrinking ancestor's constraint down), corrupting
          contentHeight into a sliver — which is why a closed section could
          come back near-empty on reopen. Unmounts after the first
          measurement; only content whose shape changes while genuinely
          open (a chip grid's "show more") needs the gated re-measure below. */}
      {contentHeight === 0 && (
        <View
          style={{ position: 'absolute', opacity: 0, left: 0, right: 0, zIndex: -1 }}
          pointerEvents="none"
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (h > 0) setContentHeight(h);
          }}
        >
          {children}
        </View>
      )}

      <Animated.View
        pointerEvents={open ? 'auto' : 'none'}
        style={{
          overflow: 'hidden',
          opacity: anim,
          height: contentHeight ? anim.interpolate({ inputRange: [0, 1], outputRange: [0, contentHeight] }) : undefined,
        }}
      >
        <View
          // Only trusted while `open` is actually settled true — during the
          // close animation `open` is already false for the full 300ms, so
          // this can't re-capture the same corrupting transient height the
          // probe above was built to avoid.
          onLayout={(e) => {
            if (!open) return;
            const h = e.nativeEvent.layout.height;
            if (h > 0 && h !== contentHeight) setContentHeight(h);
          }}
        >
          {children}
        </View>
      </Animated.View>
    </View>
  );
}

// ── Chip grid ─────────────────────────────────────────────────────────────────

function ChipGrid({
  items, muted = false, limit = 8,
}: { items: string[]; muted?: boolean; limit?: number }) {
  const C = useColors();
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, limit);
  const hidden = items.length - limit;
  return (
    <View style={styles.chipWrap}>
      {shown.map(item => (
        <View key={item} style={[styles.chip, muted && styles.chipMuted]}>
          <Text style={[styles.chipText, muted && styles.chipTextMuted]}>{item}</Text>
        </View>
      ))}
      {items.length > limit && !expanded && (
        <TouchableOpacity onPress={() => setExpanded(true)} style={[styles.chip, styles.chipExpand, { borderColor: C.primary }]}>
          <Text style={[styles.chipExpandText, { color: C.primary }]}>+{hidden} more</Text>
        </TouchableOpacity>
      )}
      {expanded && items.length > limit && (
        <TouchableOpacity onPress={() => setExpanded(false)} style={[styles.chip, styles.chipExpand, { borderColor: C.primary }]}>
          <Text style={[styles.chipExpandText, { color: C.primary }]}>Show less</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Visit card ────────────────────────────────────────────────────────────────

function VisitCard({ visit }: { visit: Visit }) {
  const C = useColors();
  const date = visit.visited_date
    ? new Date(visit.visited_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;
  return (
    <View style={styles.visitCard}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        {date && <Text style={styles.visitDate}>{date}</Text>}
        {visit.rating ? (
          <View style={{ flexDirection: 'row', gap: 1 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Ionicons
                key={i} name={i < Math.round(visit.rating!) ? 'star' : 'star-outline'}
                size={11} color={C.accent}
              />
            ))}
          </View>
        ) : null}
      </View>
      {visit.title && <Text style={styles.visitTitle}>{visit.title}</Text>}
      {visit.notes && <Text style={styles.visitNotes} numberOfLines={3}>{visit.notes}</Text>}
      {visit.photos && visit.photos.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {visit.photos.map((uri, i) => (
              <Image key={i} source={{ uri }} style={styles.visitPhoto} />
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ParkDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { getToken } = useAuth();
  const { user } = useUser();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === 'dark';
  const C = useColors();

  const [park,         setPark]         = useState<Park | null>(null);
  const [nps,          setNps]          = useState<NpsData | null>(null);
  const [weather,      setWeather]      = useState<WeatherForecast | null>(null);
  const [visits,       setVisits]       = useState<Visit[]>([]);
  const [myParkPosts,  setMyParkPosts]  = useState<FeedPost[]>([]);
  const [token,        setToken]        = useState<string | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [lightbox,     setLightbox]     = useState<{ images: NpsImage[]; idx: number } | null>(null);
  const [onBucket,     setOnBucket]     = useState(false);
  const [bucketBusy,   setBucketBusy]   = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [heroIdx,      setHeroIdx]      = useState(0);
  const [heroLoaded,   setHeroLoaded]   = useState(false);
  const [prevHeroImage, setPrevHeroImage] = useState<string | null>(null);
  const [actionBtnHeight, setActionBtnHeight] = useState<number | null>(null);
  const [bottomOverlayHeight, setBottomOverlayHeight] = useState(0);
  const [showVisitPicker, setShowVisitPicker] = useState(false);
  // Flips true if the frozen title's one line can't fit the full park name —
  // it then re-renders with "National" abbreviated instead of an ellipsis.
  const [offlineFetchedAt, setOfflineFetchedAt] = useState<string | null>(null);
  const [visitors, setVisitors] = useState<ParkVisitorsSummary | null>(null);
  const [showFriendsSheet, setShowFriendsSheet] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const isOnline = useIsOnline();
  const prevHeroRef = useRef<string | null>(null);
  const npsRef = useRef<NpsData | null>(null);
  npsRef.current = nps;
  const scrollRef = useRef<ScrollView>(null);
  // Content-relative y of the journal section, captured via onLayout so the
  // "Visits" stat cell can jump straight to it.
  const journalY = useRef(0);
  const scrollY = useRef(new Animated.Value(0)).current;
  const [titleCollapsed, setTitleCollapsed] = useState(false);
  const titleCollapsedRef = useRef(false);
  // Discrete 0/1 value driven by a timing animation on the `titleCollapsed`
  // breakpoint — NOT interpolated straight off scrollY. That way the frozen
  // bar is always either fully hidden or fully shown; it can't be caught
  // half-in if the user stops scrolling mid-transition.
  const barAnim = useRef(new Animated.Value(0)).current;
  // Same 0/1 breakpoint, longer duration — the three action buttons slide
  // into the "..." more lazily than the title swap. The duration shrinks
  // with scroll velocity (see the scroll listener): a fast fling brings the
  // frozen title in on top of buttons still mid-travel, so the faster the
  // scroll, the quicker the buttons must clear the title's lane.
  const actionsAnim = useRef(new Animated.Value(0)).current;
  // Last scroll sample (offset + timestamp) for the velocity estimate above.
  const lastScrollSample = useRef({ y: 0, t: 0 });
  // Scroll progress (0 at top → 1 at the hero lock point), set from the
  // scroll listener — drives the readability blur's `intensity`. JS-side
  // value: a native-driven node can't feed a non-style prop.
  const blurAnim = useRef(new Animated.Value(0)).current;

  const loadData = useCallback(async () => {
    const tok = await getToken();
    if (!tok || !id) return;
    setToken(tok);
    setPark(prev => { if (!prev) setLoading(true); return prev; });

    // Fully offline — skip the network entirely and read whatever the "download
    // for offline" flow (profile/edit.tsx) has cached for this park, instead of
    // leaving the screen on its "failed to load" state.
    if (!isOnline) {
      const [parksCache, npsCache] = await Promise.all([loadOfflineParks(), loadOfflineParksNps()]);
      const cachedPark = parksCache?.parks.find(p => p.park_code === id) ?? null;
      const cachedNps = npsCache?.npsByCode[id] ?? null;
      if (cachedPark) setPark(cachedPark);
      if (cachedNps) setNps(cachedNps);
      setOfflineFetchedAt(npsCache?.fetchedAt ?? parksCache?.fetchedAt ?? null);
      // "Friends who've visited" depends on the current user's live friends list —
      // there's no offline cache for it (unlike the park content above), so it
      // just stays hidden while offline rather than showing stale mutuals.
      setVisitors(null);
      setLoading(false);
      return;
    }

    try {
      const [parkData, npsData, visitsData, postsData, visitorsData] = await Promise.allSettled([
        apiFetch<Park>(`/api/parks/${id}`, tok),
        apiFetch<NpsData>(`/api/parks/${id}/nps`, tok),
        apiFetch<Visit[]>('/api/visits', tok),
        apiFetch<PostLite[]>(`/api/posts?parkCode=${id}`, tok),
        apiFetch<ParkVisitorsSummary>(`/api/parks/${id}/visitors`, tok),
      ]);

      // Live fetch succeeded for both — clear any previous "showing offline data"
      // state. If either piece failed (flaky connection, not necessarily airplane
      // mode), fall back per-field to whatever's cached rather than losing content
      // that was visible a moment ago.
      let staleAt: string | null = null;

      if (parkData.status === 'fulfilled') {
        setPark(parkData.value);
      } else {
        const parksCache = await loadOfflineParks();
        const cachedPark = parksCache?.parks.find(p => p.park_code === id) ?? null;
        if (cachedPark) { setPark(cachedPark); staleAt = parksCache!.fetchedAt; }
      }

      if (npsData.status === 'fulfilled') {
        setNps(npsData.value);
      } else {
        const npsCache = await loadOfflineParksNps();
        const cachedNps = npsCache?.npsByCode[id] ?? null;
        if (cachedNps) {
          setNps(cachedNps);
          staleAt = staleAt && staleAt > npsCache!.fetchedAt ? staleAt : npsCache!.fetchedAt;
        }
      }

      setOfflineFetchedAt(staleAt);

      const allVisits = visitsData.status === 'fulfilled' ? visitsData.value : [];
      const parkVisits = allVisits.filter((v: Visit) => v.park_code === id && !v.is_bucket_list && v.visited_date);
      setVisits(parkVisits);
      setOnBucket(allVisits.some((v: Visit) => v.park_code === id && v.is_bucket_list));

      if (postsData.status === 'fulfilled') {
        const merged: FeedPost[] = postsData.value
          .filter(p => p.clerk_user_id === user?.id)
          .map(p => {
            const v = parkVisits.find(pv => pv.id === p.visit_id);
            return {
              ...p,
              park_image_url: null,
              is_friend_post: false,
              visibility: v?.visibility ?? null,
              visit_date: v?.visited_date ?? null,
              visit_rating: v?.rating ?? null,
              visit_activities: v?.activities ?? null,
              visit_weather: v?.weather_conditions ?? null,
              visit_crowd: v?.crowd ?? null,
              visit_difficulty: v?.difficulty ?? null,
              visit_companion_count: v?.companions?.length ?? null,
              visit_companion_names: null,
              visit_highlight: v?.highlight ?? null,
              visit_title: v?.title ?? null,
            } as FeedPost;
          });
        setMyParkPosts(merged);
      }

      // No offline fallback here by design (see the !isOnline branch above) —
      // just hide the mutuals section if this particular call didn't land.
      setVisitors(visitorsData.status === 'fulfilled' ? visitorsData.value : null);
    } catch (e) {
      console.error('Park detail load failed:', e);
    } finally {
      setLoading(false);
    }
  }, [getToken, id, user?.id, isOnline]);

  const loadWeather = useCallback(async () => {
    const tok = await getToken();
    if (!tok || !id) return;
    try {
      const data = await apiFetch<WeatherForecast>(`/api/parks/${id}/weather`, tok);
      setWeather(data);
    } catch { /* weather is optional */ }
  }, [getToken, id]);

  const toggleBucketList = useCallback(async () => {
    const tok = await getToken();
    if (!tok || !id) return;
    setBucketBusy(true);
    try {
      if (onBucket) {
        await fetch(`${BASE}/api/visits?park_code=${id}`, {
          method: 'DELETE', headers: { Authorization: `Bearer ${tok}` },
        });
        setOnBucket(false);
      } else {
        await fetch(`${BASE}/api/visits`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
          body: JSON.stringify({ park_code: id, is_bucket_list: true }),
        });
        setOnBucket(true);
      }
    } catch { /* ignore */ }
    setBucketBusy(false);
  }, [getToken, id, onBucket]);

  const handleShare = useCallback(async () => {
    if (!park) return;
    // Universal Link — opens the app if installed, public web profile otherwise
    const url = `https://parkquest.me/parks/${park.park_code}`;
    try {
      await Share.share({ message: `Check out ${park.name} on ParkQuest! ${url}` });
    } catch {
      // user dismissed the share sheet
    }
  }, [park]);

  const loadDataRef = useRef(loadData);
  const loadWeatherRef = useRef(loadWeather);
  loadDataRef.current = loadData;
  loadWeatherRef.current = loadWeather;

  useEffect(() => {
    loadDataRef.current();
    loadWeatherRef.current();
    // Silent — only reads location if permission was already granted elsewhere
    // (Parks tab's explainer flow); this screen never prompts for it itself.
    Location.getForegroundPermissionsAsync().then(({ status }) => {
      if (status !== 'granted') return;
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        .then(pos => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }))
        .catch(() => {});
    });
  }, []);

  // Connectivity just returned — quietly refetch so live data (and weather,
  // which isn't cached at all) replaces whatever offline fallback is showing.
  const wasOnlineRef = useRef(isOnline);
  useEffect(() => {
    if (!wasOnlineRef.current && isOnline) {
      loadDataRef.current();
      loadWeatherRef.current();
    }
    wasOnlineRef.current = isOnline;
  }, [isOnline]);

  useEffect(() => {
    setHeroIdx(0);
    setHeroLoaded(false);
    setPrevHeroImage(null);
    prevHeroRef.current = null;
  }, [nps]);

  const totalImgs = nps?.images?.length ?? 0;
  const heroImage = totalImgs > 0 ? nps!.images[heroIdx]?.url : park?.image_url;

  useEffect(() => {
    if (!heroImage) return;
    if (prevHeroRef.current !== heroImage) {
      setPrevHeroImage(prevHeroRef.current);
      prevHeroRef.current = heroImage;
    }
  }, [heroImage]);

  // Header icons flip to dark ink over bright covers (sky-heavy photos) —
  // the glass itself is untouched. Each button samples the cover region
  // behind its own center from a 4x3 spatial blurhash (see blurhashLumaAt
  // above), so a button over bright sky can go dark while one over dark
  // cliffs stays light. Slots: back (left), then the right-side trio's
  // three 44pt-plus-8-gap positions. Only meaningful where real Liquid
  // Glass renders; the fallback circle is a fixed dark fill, so light ink
  // stays correct there.
  const [headerLight, setHeaderLight] = useState({ back: false, slot1: false, slot2: false, slot3: false });
  useEffect(() => {
    let cancelled = false;
    if (!heroImage) { setHeaderLight({ back: false, slot1: false, slot2: false, slot3: false }); return; }
    ExpoImage.generateBlurhashAsync(heroImage, [4, 3])
      .then(hash => {
        if (cancelled || !hash) return;
        const y = Math.min((insets.top + 30) / HERO_MAX, 1); // button centers
        const lightAt = (px: number) => blurhashLumaAt(hash, px / SW, y) > 0.6;
        setHeaderLight({
          back:  lightAt(38),
          slot1: lightAt(SW - 142),
          slot2: lightAt(SW - 90),
          slot3: lightAt(SW - 38),
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [heroImage, insets.top]);
  const inkFor = (light: boolean) => light && liquidGlassAvailable ? '#26231C' : '#FFFBF1';
  const backInk = inkFor(headerLight.back);
  const slot1Ink = inkFor(headerLight.slot1);
  const slot2Ink = inkFor(headerLight.slot2);
  const slot3Ink = inkFor(headerLight.slot3);
  // "..." context-menu icon tint — menu surface follows the system scheme.
  const menuInk = isDark ? '#FFFBF1' : '#26231C';

  // Bumped on every manual swipe so the auto-rotate timer restarts — otherwise
  // an auto-advance could land right after the user swiped.
  const [heroSwipeEpoch, setHeroSwipeEpoch] = useState(0);

  useEffect(() => {
    // Paused while collapsed — the hero is just a thin strip behind the
    // frozen title there, so cycling covers is invisible churn.
    if (!heroLoaded || !nps || nps.images.length < 2 || titleCollapsed) return;
    const tid = setInterval(() => {
      setHeroIdx(prev => (prev + 1) % npsRef.current!.images.length);
    }, 5000);
    return () => clearInterval(tid);
  }, [heroLoaded, nps, heroSwipeEpoch, titleCollapsed]);

  const goHero = useCallback((dir: 1 | -1) => {
    const total = npsRef.current?.images.length ?? 0;
    if (total < 2) return;
    setHeroIdx(prev => (prev + dir + total) % total);
    setHeroSwipeEpoch(e => e + 1);
  }, []);

  // Horizontal swipe over the hero switches covers manually (the tap-to-open
  // lightbox stays: a swipe claims the responder, which cancels the tap).
  // Claim only clearly horizontal moves so the page's vertical scroll wins
  // everywhere else.
  const heroPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.5,
      onPanResponderRelease: (_, { dx, vx }) => {
        if (dx <= -40 || vx <= -0.5) goHero(1);
        else if (dx >= 40 || vx >= 0.5) goHero(-1);
      },
    })
  ).current;

  const parkStatus = (() => {
    if (visits.some(v => !v.is_bucket_list && v.visited_date)) return 'visited';
    return 'notVisited';
  })();

  const sortedVisits = [...visits]
    .filter(v => !v.is_bucket_list && v.visited_date)
    .sort((a, b) => new Date(b.visited_date!).getTime() - new Date(a.visited_date!).getTime());
  const lastVisit = sortedVisits[0] ?? null;

  const handleEditVisitPress = () => {
    if (sortedVisits.length > 1) {
      setShowVisitPicker(true);
      return;
    }
    if (sortedVisits[0]) router.push(`/(modals)/log-visit?visitId=${sortedVisits[0].id}` as never);
  };

  // Daytime forecast periods only
  const forecastDays = weather?.periods.filter(p => p.isDaytime).slice(0, 7) ?? [];
  // Pair each daytime with the night low
  const forecastNights = weather?.periods.filter(p => !p.isDaytime) ?? [];

  const stripImages: Array<{ img: NpsImage; actualIdx: number }> = [];
  if (nps && totalImgs >= 2) {
    const stripCount = Math.min(totalImgs - 1, 4);
    for (let i = 0; i < stripCount; i++) {
      const actualIdx = (heroIdx + 1 + i) % totalImgs;
      stripImages.push({ img: nps.images[actualIdx], actualIdx });
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  if (!park) {
    return (
      <View style={styles.loadingWrap}>
        <Ionicons name="cloud-offline-outline" size={36} color={C.inkMute} style={{ marginBottom: 10 }} />
        <Text style={{ color: C.inkMute, fontSize: 15, fontWeight: '600', marginBottom: 14 }}>
          Failed to load park
        </Text>
        <TouchableOpacity
          onPress={() => loadData()}
          style={{ paddingHorizontal: 20, paddingVertical: 10, backgroundColor: C.primary, borderRadius: 12 }}
        >
          <Text style={{ color: C.onPrimary, fontWeight: '700', fontSize: 14 }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const stateName = fullStateName(park.states);

  const distanceAway = (userLocation && park.latitude && park.longitude)
    ? distanceMiles(userLocation.lat, userLocation.lng, parseFloat(park.latitude), parseFloat(park.longitude))
    : null;
  const distanceLabel = distanceAway != null
    ? (distanceAway < 10 ? `${distanceAway.toFixed(1)} mi` : `${Math.round(distanceAway)} mi`)
    : null;

  // Pinned, locking hero: the cover photo is an absolute overlay (not a
  // scrolling child) that stretches taller on overscroll, shrinks smoothly
  // as the page scrolls, and then locks at `barHeight` — the size it needs
  // to sit behind the frozen title — instead of continuing to shrink or
  // scrolling away. The frozen title itself fades/slides in separately once
  // locked (see `barAnim` below), not tied 1:1 to the image's shrink.
  const heroMax = HERO_MAX + insets.top;
  const barHeight = HERO_MIN + insets.top;
  // Guarded: HERO_MIN >= HERO_MAX (e.g. a bad constant edit caught by Fast
  // Refresh) would flip this negative and crash every scroll interpolation
  // with "inputRange must be monotonically non-decreasing".
  const shrinkDistance = Math.max(1, heroMax - barHeight);
  // Everything below is transforms only — no animated `height`. Animating
  // layout off scrollY forces the JS driver (every scroll frame does a JS
  // round-trip + a layout pass), which is what made the collapse stutter on
  // fast flicks, worst right at the breakpoint where the title-swap state
  // update lands on the same JS frames. With transforms the scroll event
  // runs with useNativeDriver: true and the hero tracks the finger entirely
  // on the UI thread.
  //
  // Geometry: the hero box is FIXED at heroMax tall and clips its contents.
  //  - collapse: the box translates up (bottom edge rises exactly like the
  //    old height shrink), while the inner image counter-translates down by
  //    the same amount, so the image reads as pinned to the viewport with
  //    the window shrinking over it. Locks at barHeight worth of visible
  //    strip (clamp at shrinkDistance).
  //  - overscroll: the box scales from its top edge instead of growing
  //    taller, covering the stretch gap the fixed height would leave.
  const heroTranslateY = scrollY.interpolate({
    inputRange: [0, shrinkDistance],
    outputRange: [0, -shrinkDistance],
    extrapolate: 'clamp',
  });
  const heroStretchScale = scrollY.interpolate({
    inputRange: [-heroMax, 0],
    outputRange: [2, 1],
    extrapolate: 'clamp',
  });
  // heroStretchScale grows the hero box from its top edge (transformOrigin:
  // 'top'), so its bottom edge moves down by heroMax * (scale - 1) — the
  // title needs to move down by exactly that much on overscroll too, to
  // stay the same distance from the (now lower) bottom of the image,
  // without inheriting the scale itself (see heroTitleTranslateY below).
  const heroTitleOverscrollY = Animated.multiply(Animated.subtract(heroStretchScale, 1), heroMax);
  // heroTranslateY is 0 for any overscroll (negative scrollY, clamped) and
  // heroTitleOverscrollY is 0 for any normal scroll (positive scrollY,
  // clamped) — exactly one of the two is ever nonzero, so adding them just
  // picks whichever applies to the current scroll direction.
  const heroTitleTranslateY = Animated.add(heroTranslateY, heroTitleOverscrollY);
  const heroImageCounterY = scrollY.interpolate({
    inputRange: [0, shrinkDistance],
    outputRange: [0, shrinkDistance],
    extrapolate: 'clamp',
  });
  // Rests slightly zoomed in (1.15) and zooms OUT toward 1 as you scroll
  // down — the shrinking window reads as widening/fitting more width.
  // Never dips below 1, or the image would narrow past the screen edges.
  const heroImageScale = scrollY.interpolate({
    inputRange: [0, shrinkDistance],
    outputRange: [1.15, 1],
    extrapolate: 'clamp',
  });
  // The big title is bottom-anchored in the hero (heroContent's 22px bottom
  // padding + the 32px title line height), while the back/action buttons sit
  // fixed at insets.top+8 through insets.top+52 (44px circles). Once the
  // shrinking hero's height puts the title's top edge at or below the
  // buttons' bottom edge, the title is unreadable behind them — that's the
  // actual moment to swap to the frozen title + "..." menu, not an
  // arbitrary point in the shrink.
  const collapseThreshold = heroMax - (insets.top + 8 + 44) - (22 + 32);
  // The two titles swap on this threshold as a hard switch (see
  // `titleCollapsed` renders below), not a scroll-scrubbed cross-fade — the
  // big one unmounts the instant the frozen one starts animating in, so
  // there is never a frame where both are visible at once.

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          initialIndex={lightbox.idx}
          onClose={() => setLightbox(null)}
        />
      )}

      {showFriendsSheet && visitors && (
        <FriendsVisitedSheet
          friends={visitors.friends}
          others={visitors.others ?? []}
          onClose={() => setShowFriendsSheet(false)}
        />
      )}

      {showVisitPicker && (
        <VisitPickerSheet
          visits={sortedVisits.map(v => ({ id: v.id, visited_date: v.visited_date!, title: v.title }))}
          onSelect={(visitId) => router.push(`/(modals)/log-visit?visitId=${visitId}` as never)}
          onClose={() => setShowVisitPicker(false)}
        />
      )}

      {/* ── Hero — absolute overlay (not a scrolling child), pinned at the
          top. Fixed heroMax height; all motion is transforms (see the
          heroTranslateY/heroStretchScale/heroImageCounterY interpolations
          above for the geometry and why layout must never animate here).
          The big title is bottom-anchored inside, so it rides the
          translating bottom edge exactly like it rode the old height
          shrink. */}
      <Animated.View
        style={[styles.hero, {
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5,
          height: heroMax, overflow: 'hidden', justifyContent: 'flex-start',
          backgroundColor: parkColor(park.park_code),
          transformOrigin: 'top',
          transform: [{ translateY: heroTranslateY }, { scale: heroStretchScale }],
        }]}
        {...heroPan.panHandlers}
      >
        <Animated.View
          style={{
            height: heroMax, transformOrigin: 'top',
            transform: [{ translateY: heroImageCounterY }, { scale: heroImageScale }],
          }}
        >
          {/* Previous image stays visible as background during cross-dissolve */}
          {prevHeroImage && (
            <ExpoImage
              source={{ uri: prevHeroImage }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              contentPosition="top"
              cachePolicy="memory-disk"
              allowDownscaling={false}
            />
          )}
          {heroImage && (
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={0.95}
              disabled={!nps?.images?.length}
              onPress={() => nps?.images?.length && setLightbox({ images: nps.images, idx: heroIdx })}
            >
              <ExpoImage
                key={heroImage}
                source={{ uri: heroImage }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                contentPosition="top"
                cachePolicy="memory-disk"
                // Default downscaling decodes the bitmap at container size,
                // so the pull-down stretch (up to 2x via heroStretchScale)
                // magnifies a screen-sized decode and reads as blur. Full-res
                // decode keeps the overscroll zoom sharp.
                allowDownscaling={false}
                onLoad={() => { if (!heroLoaded) setHeroLoaded(true); }}
              />
            </TouchableOpacity>
          )}
          <LinearGradient
            colors={['rgba(0,0,0,0.78)', 'rgba(0,0,0,0.42)', 'transparent']}
            locations={[0, 0.35, 0.65]}
            start={{ x: 0, y: 1 }}
            end={{ x: 0, y: 0 }}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />
        </Animated.View>

        {/* Readability blur for the frozen-title strip. Lives INSIDE the
            clipped hero box so it always covers exactly the visible cover —
            a screen-fixed band only matched the hero once locked, and
            mid-shrink showed a hard blurred/sharp seam across the image.
            Intensity ramps with scroll (blurAnim, set in the scroll
            listener): zero under the big title, max at the lock point.
            Animating `intensity` is safe where animating opacity is not —
            it drives the effect's own fraction rather than alpha-ing a
            UIVisualEffectView ancestor (which kills the effect, same
            failure as the "..." glass circle). */}
        <AnimatedBlurView
          // Late onset: nothing until ~60% of the collapse (attention is
          // still on the cover/big title), then ramps to max at the lock.
          intensity={blurAnim.interpolate({ inputRange: [0.6, 1], outputRange: [0, 10], extrapolate: 'clamp' })}
          tint="default"
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* Title — a SEPARATE box from the hero above, not a child of it. RN
          transforms apply to the whole subtree, so when this lived inside
          the hero it inherited heroStretchScale along with the image,
          ballooning the title up to 2x on pull-down overscroll. This box
          only ever translates (heroTitleTranslateY — shrink tracking while
          scrolling, or matching the image's overscroll growth from the
          bottom, never both at once), so the title stays the same distance
          from the image's bottom edge in both directions without ever
          scaling itself. */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 6,
          height: heroMax, transform: [{ translateY: heroTitleTranslateY }],
        }}
      >
        {/* Fades out (1 - barAnim) as the frozen title fades in — always
            mounted so the fade actually animates (same native-driver
            mid-flight-mount caveat as the frozen title). */}
        <Animated.View
          style={[styles.heroContent, {
            position: 'absolute', left: 0, right: 0, bottom: 0,
            opacity: barAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
          }]}
        >
          <Text style={styles.heroDesignation}>{stateName.toUpperCase()}</Text>
          <Text style={styles.heroName}>{park.name}</Text>
        </Animated.View>
      </Animated.View>

      {/* Frozen title — text ONLY, nothing else animates in with it: no
          scrim, no second copy of the cover image (an earlier gradient
          scrim here read as a snippet of the photo sliding in over the big
          title). Readability over bright images comes from the text shadow
          on `frozenTitle` instead. ALWAYS mounted, fully driven by barAnim
          (opacity 0 at rest) — a view mounted mid-flight of a
          useNativeDriver animation doesn't attach to it and just pops in at
          the end value ("no entrance animation" bug). */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute', top: insets.top + 8, left: 72, right: 72, height: 44, zIndex: 8, justifyContent: 'center',
          opacity: barAnim,
          // Plain slide-down + fade. Deliberately NOT the 3D flip
          // (perspective + rotateX) — a 3D-rotated layer's projected plane
          // sweeps far outside its own bounds mid-animation and iOS stops
          // honoring sibling zIndex on such layers, which made the back
          // button vanish for a beat every time this came in.
          transform: [
            { translateY: barAnim.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }) },
          ],
        }}
      >
        {/* Abbreviation is decided up front from a character-width estimate,
            not measured: both onTextLayout probes tried here (visible
            one-liner, then a hidden unclamped copy) failed to report
            truncation reliably on device. Heavy 19pt glyphs average ~9.5pt,
            and the bar has SW - 144 to work with; erring slightly early
            just shows "Nat'l" a touch sooner, which is harmless. */}
        <Text style={styles.frozenTitle} numberOfLines={1}>
          {park.name.length > Math.floor((SW - 144) / 9.5)
            ? park.name.replace(/National/g, "Nat'l")
            : park.name}
        </Text>
      </Animated.View>

      {/* Back button — fixed overlay, always visible */}
      <GrowTouchable
        style={[styles.backBtn, { top: insets.top + 8, zIndex: 10 }]}
        onPress={() => router.back()}
        hitSlop={8}
      >
        <GlassIconBg onMedia fallbackColor="rgba(0,0,0,0.35)" />
        <Ionicons name="chevron-back" size={22} color={backInk} />
      </GrowTouchable>

      {/* Expanded actions — full-size buttons shown over the cover photo.
          At the breakpoint they slide right into the "..." button's spot
          while fading, instead of blinking out. Always mounted (barAnim-
          driven) for the same native-driver mid-flight-mount reason as the
          titles; pointerEvents flips so the hidden set never eats taps. */}
      <View
        pointerEvents={titleCollapsed ? 'none' : 'auto'}
        style={{
          position: 'absolute', top: insets.top + 8, right: 16, zIndex: 10,
          flexDirection: 'row', gap: 8,
        }}
      >
        {(() => {
          // Row is [first, second, share], 44px buttons + 8px gaps (52px per
          // slot). On collapse the two left buttons travel right into the
          // share button's slot (+104 / +52), fading out as they arrive; the
          // share button stays put and crossfades into the "..." rendered on
          // top of the same spot. Reads as all three merging into one.
          const travel = (dist: number) => ({
            opacity: actionsAnim.interpolate({ inputRange: [0, 0.7], outputRange: [1, 0], extrapolate: 'clamp' as const }),
            transform: [{ translateX: actionsAnim.interpolate({ inputRange: [0, 1], outputRange: [0, dist] }) }],
          });
          // logVisitBtn lands in slot1 when visited, slot2 otherwise, so it
          // takes its slot's ink as a param.
          const logVisitBtn = (ink: string) => (
            <GrowTouchable
              style={[styles.backBtn, { position: 'relative', left: undefined, top: undefined }]}
              onPress={() => router.push({ pathname: '/(modals)/log-visit', params: logVisitParams(park) } as never)}
              hitSlop={8}
            >
              <GlassIconBg onMedia fallbackColor="rgba(0,0,0,0.35)" />
              <Ionicons name="checkmark-outline" size={25} color={ink} />
            </GrowTouchable>
          );
          const secondBtn = parkStatus === 'visited' ? (
            <GrowTouchable
              style={[styles.backBtn, { position: 'relative', left: undefined, top: undefined }]}
              onPress={handleEditVisitPress}
              hitSlop={8}
            >
              <GlassIconBg onMedia fallbackColor="rgba(0,0,0,0.35)" />
              <Ionicons name="pencil-outline" size={19} color={slot2Ink} />
            </GrowTouchable>
          ) : logVisitBtn(slot2Ink);
          const firstBtn = parkStatus === 'visited' ? logVisitBtn(slot1Ink) : (
            <GrowTouchable
              style={[styles.backBtn, { position: 'relative', left: undefined, top: undefined }]}
              onPress={toggleBucketList}
              disabled={bucketBusy}
              hitSlop={8}
            >
              <GlassIconBg onMedia fallbackColor="rgba(0,0,0,0.35)" />
              {bucketBusy ? (
                <ActivityIndicator size="small" color={slot1Ink} />
              ) : (
                <Ionicons name={onBucket ? 'bookmark' : 'bookmark-outline'} size={22} color={onBucket ? C.bucket : slot1Ink} />
              )}
            </GrowTouchable>
          );
          return (
            <>
              <Animated.View style={travel(104)}>{firstBtn}</Animated.View>
              <Animated.View style={travel(52)}>{secondBtn}</Animated.View>
              <Animated.View style={{ opacity: actionsAnim.interpolate({ inputRange: [0.55, 0.9], outputRange: [1, 0], extrapolate: 'clamp' }) }}>
                <GrowTouchable
                  style={[styles.backBtn, { position: 'relative', left: undefined, top: undefined }]}
                  onPress={handleShare}
                  hitSlop={8}
                >
                  <GlassIconBg onMedia fallbackColor="rgba(0,0,0,0.35)" />
                  <Ionicons name="share-outline" size={22} color={slot3Ink} />
                </GrowTouchable>
              </Animated.View>
            </>
          );
        })()}
      </View>

      {/* Actions menu — the "..." the row above merges into. Sits UNDER the
          share button (zIndex 9 vs the row's 10) at the same spot, mounted
          only while collapsed: the share button's own late fade-out reveals
          it, which reads as the same crossfade as before. Deliberately NOT
          opacity-animated itself — a Liquid Glass view that mounts (or
          lives) inside an alpha-0 ancestor renders no glass material at all
          on device (UIKit disables the effect under alpha < 1), which is
          why this button had no circle while the back button did. */}
      {titleCollapsed && (
      <View
        style={{
          position: 'absolute', top: insets.top + 8, right: 16, zIndex: 9,
        }}
      >
        {/* Glass circle lives on this plain wrapper, not inside MenuView's
            child — MenuView wraps its trigger in its own native container
            for the context-menu interaction, which doesn't reliably respect
            the child's own overflow:hidden/borderRadius clipping, so the
            glass fill wasn't rendering as a circle. A sibling wrapper with
            the clipping is guaranteed to clip regardless of what MenuView
            does internally. */}
        <View style={[styles.backBtn, { position: 'relative', left: undefined, top: undefined }]}>
          <GlassIconBg onMedia fallbackColor="rgba(0,0,0,0.35)" />
          <MenuView
            onOpenMenu={() => setShowHeaderMenu(true)}
            onCloseMenu={() => setShowHeaderMenu(false)}
            onPressAction={({ nativeEvent }) => {
              switch (nativeEvent.event) {
                case 'log-visit':
                  router.push({ pathname: '/(modals)/log-visit', params: logVisitParams(park) } as never);
                  break;
                case 'edit-visit':
                  handleEditVisitPress();
                  break;
                case 'bucket':
                  toggleBucketList();
                  break;
                case 'share':
                  handleShare();
                  break;
              }
            }}
            actions={[
              // Explicit imageColor on every action: the menu lib's new-arch
              // bridge always forwards imageColor (0 when unset) and the
              // native side tints with it — color 0 is transparent, which
              // made these SF Symbols render invisible.
              { id: 'log-visit', title: parkStatus === 'visited' ? 'Log another visit' : 'Log a visit', image: 'checkmark.circle', imageColor: menuInk },
              ...(parkStatus === 'visited' ? [{ id: 'edit-visit', title: 'Edit visit', image: 'pencil', imageColor: menuInk }] : []),
              ...(parkStatus !== 'visited' ? [{
                id: 'bucket',
                title: onBucket ? 'Remove from bucket list' : 'Add to bucket list',
                image: onBucket ? 'bookmark.fill' : 'bookmark',
                imageColor: menuInk,
              }] : []),
              { id: 'share', title: 'Share', image: 'square.and.arrow.up', imageColor: menuInk },
            ]}
          >
            {/* Open-menu dim lives on the trigger, not the glass wrapper —
                alpha < 1 on a GlassView ancestor disables the material. */}
            <TouchableOpacity hitSlop={8} disabled={bucketBusy} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', opacity: showHeaderMenu ? 0.6 : 1 }}>
              {bucketBusy ? (
                <ActivityIndicator size="small" color={slot3Ink} />
              ) : (
                <Ionicons name="ellipsis-horizontal" size={22} color={slot3Ink} />
              )}
            </TouchableOpacity>
          </MenuView>
        </View>
      </View>
      )}

      <Animated.ScrollView
        ref={scrollRef}
        style={styles.screen}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: heroMax, paddingBottom: bottomOverlayHeight + 12 }}
        contentInsetAdjustmentBehavior="never"
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          {
            // Transform-only consumers (see hero interpolations) — keep it
            // that way. Reintroducing an animated height/layout prop off
            // scrollY forces this back to false and brings the fast-scroll
            // stutter back.
            useNativeDriver: true,
            listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
              const y = e.nativeEvent.contentOffset.y;
              // Blur over the shrinking cover ramps with scroll progress,
              // hitting max exactly at the lock point (cover fully off
              // screen). JS-driven on purpose: `intensity` isn't a style
              // prop, so it can't ride the native-driver scrollY — and this
              // listener already runs per scroll frame anyway.
              blurAnim.setValue(Math.min(Math.max(y / shrinkDistance, 0), 1));
              // Scroll velocity (px/ms) from consecutive samples. Gaps over
              // 100ms mean the finger was resting between distinct scrolls,
              // not moving — treat those as zero rather than dividing a big
              // offset jump by a big time gap and calling it slow.
              const now = Date.now();
              const dt = now - lastScrollSample.current.t;
              const vel = dt > 0 && dt < 100 ? Math.abs(y - lastScrollSample.current.y) / dt : 0;
              lastScrollSample.current = { y, t: now };
              const collapsed = y >= collapseThreshold;
              if (collapsed !== titleCollapsedRef.current) {
                titleCollapsedRef.current = collapsed;
                setTitleCollapsed(collapsed);
                Animated.timing(barAnim, {
                  toValue: collapsed ? 1 : 0,
                  duration: 220,
                  useNativeDriver: true,
                }).start();
                Animated.timing(actionsAnim, {
                  toValue: collapsed ? 1 : 0,
                  // Lazy 420ms at a leisurely scroll, tightening toward
                  // 160ms as velocity climbs so the buttons are out of the
                  // frozen title's lane (their fade completes at 70% of the
                  // duration) by the time its own 220ms slide-in lands.
                  duration: Math.max(160, Math.min(420, 420 - vel * 160)),
                  useNativeDriver: true,
                }).start();
              }
            },
          }
        )}
      >
        {/* ── Photo strip ──────────────────────────────────────────────────── */}
        {stripImages.length > 0 && (
          <ScrollView
            horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.photoStrip}
          >
            {stripImages.map(({ img, actualIdx }, slotIdx) => {
              const gc = parkGradient(park.park_code);
              // With few images, stretch them to span the same width as the
              // stat card below (screen minus the strip's 16px side padding)
              // instead of leaving a ragged right edge. 4+ keeps the fixed
              // size and scrolls.
              const n = stripImages.length;
              const thumbWidth = n <= 3 ? (SW - 32 - (n - 1) * 8) / n : 110;
              return (
                <TouchableOpacity
                  key={slotIdx}
                  onPress={() => setLightbox({ images: nps!.images, idx: actualIdx })}
                  activeOpacity={0.85}
                  style={[styles.photoStripItem, { width: thumbWidth }]}
                >
                  <LinearGradient
                    colors={gc}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <ExpoImage
                    source={{ uri: img.url }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    transition={800}
                    cachePolicy="memory-disk"
                  />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {offlineFetchedAt && <OfflineBanner fetchedAt={offlineFetchedAt} noun="park details" />}

        {/* ── Quick stats ───────────────────────────────────────────────────── */}
        <View style={styles.statsRow}>
          {/* Multi-state parks stack one state per line so a long list
              ("California, Nevada") doesn't squeeze the other cells. */}
          <StatCell label="State" value={fullStateName(park.states).split(', ').join('\n')} />
          <View style={styles.statDivider} />
          <StatCell
            label="Status"
            value={parkStatus === 'visited' ? 'Visited' : onBucket ? 'Bucket list' : 'Not yet'}
            valueColor={parkStatus === 'visited' ? C.visited : onBucket ? C.bucket : C.inkMute}
          />
          <View style={styles.statDivider} />
          <StatCell
            label="Visits"
            value={String(visits.length)}
            onPress={() => scrollRef.current?.scrollTo({ y: journalY.current, animated: true })}
          />
          {distanceLabel && (
            <>
              <View style={styles.statDivider} />
              <StatCell label="Distance" value={distanceLabel} />
            </>
          )}
        </View>

        {/* ── Friends who've visited ──────────────────────────────────────────
            Omitted entirely at zero (no offline-fallback text/spinner needed —
            it's a nice-to-have, not core content) and while offline, since this
            depends on the current user's live friends list rather than anything
            cached for offline viewing. */}
        {isOnline && visitors && (visitors.total > 0 || (visitors.others_total ?? 0) > 0) && (
          <FriendsVisitedRow
            friends={visitors.friends} total={visitors.total}
            others={visitors.others ?? []} othersTotal={visitors.others_total ?? 0}
            onPress={() => setShowFriendsSheet(true)}
          />
        )}

        <View style={styles.divider} />

        {/* ── About ─────────────────────────────────────────────────────────── */}
        {park.description ? (
          <Section title="About">
            <Text style={styles.bodyText}>{park.description}</Text>
          </Section>
        ) : null}

        {/* ── Activities ───────────────────────────────────────────────────── */}
        {nps?.activities && nps.activities.length > 0 ? (
          <Section title="Activities">
            <ChipGrid items={nps.activities} />
          </Section>
        ) : null}

        {/* ── Topics ───────────────────────────────────────────────────────── */}
        {nps?.topics && nps.topics.length > 0 ? (
          <Section title="Topics">
            <ChipGrid items={nps.topics} muted />
          </Section>
        ) : null}

        {/* ── Operating hours ───────────────────────────────────────────────── */}
        {nps?.operatingHours && nps.operatingHours.length > 0 ? (
          <Section title="Operating Hours">
            {nps.operatingHours.map((h, hi) => (
              <View key={hi} style={[styles.hoursCard, hi < nps.operatingHours.length - 1 && { marginBottom: 10 }]}>
                {nps.operatingHours.length > 1 && (
                  <Text style={styles.hoursName}>{h.name}</Text>
                )}
                {DAYS.map(day => {
                  const val = h.standardHours?.[day.toLowerCase()] ?? '—';
                  return (
                    <View key={day} style={styles.hoursRow}>
                      <Text style={styles.hoursDay}>{day}</Text>
                      <Text style={styles.hoursVal}>{val}</Text>
                    </View>
                  );
                })}
                {h.description ? (
                  <Text style={[styles.bodyText, { marginTop: 10 }]}>
                    {h.description}
                  </Text>
                ) : null}
              </View>
            ))}
          </Section>
        ) : null}

        {/* ── Location ──────────────────────────────────────────────────────── */}
        {park.latitude && park.longitude ? (
          <Section title="Location">
            <View style={styles.miniMapContainer}>
              <MapView
                style={styles.miniMap}
                scrollEnabled={false}
                zoomEnabled={false}
                rotateEnabled={false}
                pitchEnabled={false}
                initialRegion={{
                  latitude: parseFloat(park.latitude),
                  longitude: parseFloat(park.longitude),
                  latitudeDelta: 1.2,
                  longitudeDelta: 1.2,
                }}
                showsUserLocation={false}
                showsMyLocationButton={false}
                showsCompass={false}
                toolbarEnabled={false}
                moveOnMarkerPress={false}
                pointerEvents="none"
              >
                <Marker
                  coordinate={{
                    latitude: parseFloat(park.latitude),
                    longitude: parseFloat(park.longitude),
                  }}
                  pinColor={C.primary}
                />
              </MapView>
            </View>
            <TouchableOpacity
              style={[styles.viewOnMapBtn, actionBtnHeight != null && { height: actionBtnHeight, paddingVertical: 0 }]}
              onPress={() => router.push({ pathname: '/(tabs)/map', params: { parkCode: park.park_code } } as never)}
              activeOpacity={0.8}
            >
              <Ionicons name="map-outline" size={14} color={C.primary} />
              <Text style={[styles.viewOnMapBtnText, { color: C.primary }]}>View on full map</Text>
              <Ionicons name="arrow-forward" size={13} color={C.primary} />
            </TouchableOpacity>
          </Section>
        ) : null}

        {/* ── Entrance fees ─────────────────────────────────────────────────── */}
        {nps?.entranceFees && nps.entranceFees.length > 0 ? (
          <Section title="Entrance Fees">
            {nps.entranceFees.map((fee, fi) => (
              <View key={fi} style={[styles.feeRow, fi < nps.entranceFees.length - 1 && { marginBottom: 12 }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                  <Text style={styles.feeName}>{fee.title || 'Entrance'}</Text>
                  <Text style={[styles.feeCost, { color: C.primary }]}>
                    {fee.cost === '0.00' || fee.cost === '0' ? 'Free' : `$${parseFloat(fee.cost).toFixed(0)}`}
                  </Text>
                </View>
                {fee.description ? (
                  <Text style={styles.feeDesc}>{fee.description}</Text>
                ) : null}
              </View>
            ))}
          </Section>
        ) : null}

        {/* ── Directions ───────────────────────────────────────────────────── */}
        {nps?.directionsInfo ? (
          <Section title="Directions">
            <Text style={styles.bodyText}>{nps.directionsInfo}</Text>
            {nps.directionsUrl ? (
              <TouchableOpacity
                onPress={() => Linking.openURL(nps.directionsUrl)}
                style={styles.linkBtn}
              >
                <Ionicons name="navigate-outline" size={14} color={C.primary} />
                <Text style={[styles.linkBtnText, { color: C.primary }]}>Open directions</Text>
              </TouchableOpacity>
            ) : null}
          </Section>
        ) : null}

        {/* ── Contact ───────────────────────────────────────────────────────── */}
        {(nps?.phone || nps?.email || nps?.url) ? (
          <Section title="Contact">
            <View style={{ gap: 10 }}>
              {nps.phone ? (
                <TouchableOpacity
                  style={styles.contactRow}
                  onPress={() => Linking.openURL(`tel:${nps.phone.replace(/\D/g, '')}`)}
                >
                  <Ionicons name="call-outline" size={15} color={C.inkMute} />
                  <Text style={styles.contactText}>{nps.phone}</Text>
                </TouchableOpacity>
              ) : null}
              {nps.email ? (
                <TouchableOpacity
                  style={styles.contactRow}
                  onPress={() => Linking.openURL(`mailto:${nps.email}`)}
                >
                  <Ionicons name="mail-outline" size={15} color={C.inkMute} />
                  <Text style={styles.contactText}>{nps.email}</Text>
                </TouchableOpacity>
              ) : null}
              {nps.url ? (
                <TouchableOpacity
                  style={styles.contactRow}
                  onPress={() => Linking.openURL(nps.url)}
                >
                  <Ionicons name="globe-outline" size={15} color={C.inkMute} />
                  <Text style={styles.contactText}>NPS Website</Text>
                  <Ionicons name="arrow-forward" size={11} color={C.inkMute} />
                </TouchableOpacity>
              ) : null}
            </View>
          </Section>
        ) : null}

        {/* ── Weather ───────────────────────────────────────────────────────── */}
        {/* One Section for both data sources, not two swapped by which has
            loaded — nps.weatherInfo (bundled with the rest of the NPS fetch)
            typically arrives well before forecastDays (a separate, slower
            NWS call), and remounting an entirely different Section
            ("Weather" -> "Weather Forecast") the moment the forecast caught
            up threw away its open/animation state and popped visibly. This
            mounts once as soon as either is available and just fills in the
            forecast row underneath when it arrives, same as any other
            section whose content grows while open. */}
        {(forecastDays.length > 0 || nps?.weatherInfo) && (
          <Section title="Weather">
            {forecastDays.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }}>
                <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 4 }}>
                  {forecastDays.map((p, i) => {
                    const night = forecastNights[i];
                    return (
                      <View key={i} style={styles.weatherCard}>
                        <Text style={styles.weatherDay}>{dayLabel(p)}</Text>
                        <Text style={styles.weatherEmoji}>{weatherEmoji(p.shortForecast)}</Text>
                        <Text style={styles.weatherTemp}>{p.temperature}°{p.temperatureUnit}</Text>
                        {night && (
                          <Text style={styles.weatherLow}>{night.temperature}° low</Text>
                        )}
                        <Text style={styles.weatherDesc} numberOfLines={2}>{p.shortForecast}</Text>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            )}
            {nps?.weatherInfo && (
              <Text style={[styles.bodyText, forecastDays.length > 0 && { marginTop: 12 }]}>{nps.weatherInfo}</Text>
            )}
          </Section>
        )}

        <View
          style={styles.divider}
          onLayout={e => { journalY.current = e.nativeEvent.layout.y; }}
        />

        {/* ── Journal ───────────────────────────────────────────────────────── */}
        <Section title={`Your Journal (${visits.length})`}>
          {visits.length === 0 ? (
            <View style={styles.journalEmpty}>
              <Text style={{ fontSize: 36, marginBottom: 14 }}>🌲</Text>
              <Text style={{ fontWeight: '800', color: C.ink, fontSize: 16, marginBottom: 6 }}>
                No visits yet
              </Text>
              <Text style={{ color: C.inkMute, fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 22 }}>
                Log your first adventure at {park.name}.
              </Text>
              <TouchableOpacity
                style={[styles.journalEmptyBtn, { backgroundColor: C.primary }]}
                onPress={() => router.push({ pathname: '/(modals)/log-visit', params: logVisitParams(park) } as never)}
                activeOpacity={0.8}
              >
                <Ionicons name="pencil" size={14} color="#FFFBF1" />
                <Text style={styles.actionBtnText}>Log a visit</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ gap: 0 }}>
              {token && myParkPosts.length > 0
                ? myParkPosts.map(post => (
                    <PostCard
                      key={post.id}
                      post={post}
                      myUserId={user?.id ?? ''}
                      myAvatarUrl={user?.imageUrl}
                      myName={user?.fullName ?? user?.username}
                      onDelete={deletedId => setMyParkPosts(prev => prev.filter(p => p.id !== deletedId))}
                    />
                  ))
                : visits.map(v => (
                    <View key={v.id} style={[styles.visitCard, { marginBottom: 12 }]}>
                      <Text style={styles.visitDate}>
                        {v.visited_date
                          ? new Date(v.visited_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                          : 'No date'}
                      </Text>
                      {v.title ? <Text style={styles.visitTitle}>{v.title}</Text> : null}
                      {v.notes ? <Text style={styles.visitNotes} numberOfLines={4}>{v.notes}</Text> : null}
                    </View>
                  ))
              }
              <TouchableOpacity
                style={[styles.actionBtnOutline, { borderColor: C.primary, marginTop: 4 }]}
                onPress={() => router.push({ pathname: '/(modals)/log-visit', params: logVisitParams(park) } as never)}
                activeOpacity={0.8}
              >
                <Ionicons name="add" size={16} color={C.primary} />
                <Text style={[styles.actionBtnOutlineText, { color: C.primary }]}>Log another visit</Text>
              </TouchableOpacity>
            </View>
          )}
        </Section>

        {/* ── Attribution ───────────────────────────────────────────────────── */}
        <View style={styles.attribution}>
          <Text style={styles.attributionText}>
            Park information is sourced directly from the{" "}
            <Text style={styles.attributionLink} onPress={() => Linking.openURL("https://www.nps.gov")}>
              National Park Service (NPS)
            </Text>
            . Weather forecasts are provided by the{" "}
            <Text style={styles.attributionLink} onPress={() => Linking.openURL("https://www.weather.gov")}>
              National Weather Service (NWS)
            </Text>
            . ParkQuest does not guarantee the accuracy, completeness, or timeliness of any information displayed. Always verify details with official sources before your visit.
          </Text>
        </View>
      </Animated.ScrollView>

      {/* Pinned action bar — AllTrails-style: the tab bar hides on this
          nested detail page (see FloatingTabBar) and these Liquid Glass
          pills own the bottom edge, floating over the scrolling content. */}
      <View
        style={[styles.actionOverlay, { paddingBottom: insets.bottom + 8 }]}
        onLayout={(e) => setBottomOverlayHeight(e.nativeEvent.layout.height)}
      >
        {/* Readability fade behind the glass pills — bg-toned alpha ramp
            (same recipe as log-visit's footer fade; a literal black ramp
            reads smoky over the light theme). Literal stops per scheme:
            LinearGradient can't take DynamicColorIOS. A mid stop front-loads
            the opacity so the ramp is already dark by the button row instead
            of only opaque in the safe-area strip below it. */}
        <LinearGradient
          colors={isDark
            ? ['rgba(23,21,17,0)', 'rgba(23,21,17,0.85)', 'rgba(23,21,17,0.97)']
            : ['rgba(242,235,219,0)', 'rgba(242,235,219,0.85)', 'rgba(242,235,219,0.97)']}
          locations={[0, 0.6, 1]}
          style={[StyleSheet.absoluteFill, { top: -70 }]}
          pointerEvents="none"
        />
        <View style={styles.actionRow}>
          {parkStatus === 'visited' ? (
            <>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => router.push({ pathname: '/(modals)/log-visit', params: logVisitParams(park) } as never)}
                onLayout={(e) => setActionBtnHeight(e.nativeEvent.layout.height)}
                activeOpacity={0.8}
              >
                <GlassIconBg borderRadius={999} tintColor={C.primary} fallbackColor={C.primary} />
                <Ionicons name="checkmark" size={21} color="#FFFBF1" />
                <Text style={styles.actionBtnText}>Log another visit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionBtnSecondary}
                onPress={() => { if (lastVisit) router.push(`/profile/journal/${lastVisit.id}` as never); }}
                activeOpacity={0.8}
              >
                <GlassIconBg borderRadius={999} />
                <Ionicons name="pencil-outline" size={18} color={C.primary} />
                <Text style={[styles.actionBtnOutlineText, { color: C.primary }]}>Edit last visit</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => router.push({ pathname: '/(modals)/log-visit', params: logVisitParams(park) } as never)}
                onLayout={(e) => setActionBtnHeight(e.nativeEvent.layout.height)}
                activeOpacity={0.8}
              >
                <GlassIconBg borderRadius={999} tintColor={C.primary} fallbackColor={C.primary} />
                <Ionicons name="checkmark" size={21} color="#FFFBF1" />
                <Text style={styles.actionBtnText}>Log a visit</Text>
              </TouchableOpacity>
              {/* Bucket toggle — icon-only glass circle, the AllTrails
                  "heart" slot. */}
              <TouchableOpacity
                style={styles.bucketCircle}
                onPress={toggleBucketList}
                activeOpacity={0.8}
                disabled={bucketBusy}
                hitSlop={4}
              >
                <GlassIconBg borderRadius={999} tintColor={onBucket ? colorStr(C.bucket) : undefined} fallbackColor={onBucket ? colorStr(C.bucket) : undefined} />
                {bucketBusy ? (
                  <ActivityIndicator size="small" color={onBucket ? C.onPrimary : C.bucket} />
                ) : (
                  <Ionicons
                    name={onBucket ? 'bookmark' : 'bookmark-outline'}
                    size={22}
                    color={onBucket ? C.onPrimary : C.bucket}
                  />
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

// ── Stat cell ─────────────────────────────────────────────────────────────────

// Cells size to their own text (flexBasis auto) and split only the leftover
// space equally (flexGrow) — no fixed fourths, so "Hawaii" and "2333 mi"
// each get what they actually need.
function StatCell({ label, value, valueColor, onPress }: {
  label: string; value: string; valueColor?: ColorValue; onPress?: () => void;
}) {
  const body = (
    <>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </>
  );
  if (onPress) {
    return (
      <TouchableOpacity style={styles.statCell} onPress={onPress} activeOpacity={0.6}>
        {body}
      </TouchableOpacity>
    );
  }
  return <View style={styles.statCell}>{body}</View>;
}

// ── Friends who've visited (mutuals) ─────────────────────────────────────────

function FriendsVisitedRow({ friends, total, others, othersTotal, onPress }: {
  friends: ParkVisitorsSummary['friends']; total: number;
  others: ParkVisitorsSummary['friends']; othersTotal: number;
  onPress: () => void;
}) {
  // Friends always lead the avatar stack; community members fill leftover slots.
  const shown = [...friends, ...others].slice(0, 3);
  const label =
    total > 0 && othersTotal > 0
      ? `${total} ${total === 1 ? 'friend' : 'friends'} and ${othersTotal} ${othersTotal === 1 ? 'other user' : 'other users'} have visited`
      : total > 0
        ? `${total} ${total === 1 ? 'friend has' : 'friends have'} visited`
        : `${othersTotal} ${othersTotal === 1 ? 'user has' : 'users have'} visited`;
  return (
    <TouchableOpacity style={styles.mutualsRow} activeOpacity={0.7} onPress={onPress}>
      <View style={styles.mutualsAvatars}>
        {shown.map((f, i) => (
          <Avatar
            key={f.clerk_user_id}
            url={f.avatar_url}
            name={f.display_name ?? f.username}
            size={28}
            style={{
              ...styles.mutualsAvatar,
              marginLeft: i === 0 ? 0 : -10,
              zIndex: shown.length - i,
            }}
          />
        ))}
      </View>
      <Text style={styles.mutualsText}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bg,
  },
  loadingWrap: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Hero
  hero: {
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  backBtn: {
    position: 'absolute',
    left: 16,
    // 44pt circle with ~24pt icons — the app-wide round icon button recipe
    // (AllTrails' header buttons; ~0.55 icon-to-circle fill ratio).
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroContent: {
    padding: 20,
    paddingBottom: 22,
  },
  heroDesignation: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.65)',
    letterSpacing: 1.4,
    marginBottom: 4,
  },
  heroName: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFBF1',
    letterSpacing: -0.5,
    lineHeight: 32,
  },
  frozenTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#FFFBF1',
    letterSpacing: -0.3,
    lineHeight: 24,
    // Stands in for the scrim this bar used to have — keeps white text
    // readable over bright imagery without darkening the photo itself.
    textShadowColor: 'rgba(0,0,0,0.65)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },

  // Photo strip
  photoStrip: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    flexDirection: 'row',
  },
  photoStripItem: {
    width: 110,
    height: 72,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: C.hairline,
    overflow: 'hidden',
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: C.hairline,
    overflow: 'hidden',
    marginTop: 0,
    marginBottom: 12,
  },
  statCell: {
    // Content-based width: basis auto + grow shares only the leftover space.
    flexGrow: 1,
    flexShrink: 1,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  statLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: C.inkMute,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '700',
    color: C.ink,
    textAlign: 'center',
  },
  statDivider: {
    width: 0.5,
    backgroundColor: C.hairline,
    marginVertical: 10,
  },

  // Friends who've visited (mutuals)
  mutualsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: C.hairline,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  mutualsAvatars: {
    flexDirection: 'row',
  },
  mutualsAvatar: {
    borderWidth: 2,
    borderColor: C.surface,
  },
  mutualsText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: C.inkSoft,
  },

  // Actions
  // Transparent — the glass pills float directly over the scrolling
  // content, no bar surface behind them (AllTrails-style).
  actionOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 12,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 16,
    // No bottom margin — the overlay's tabBarSpace padding already leaves
    // a 12pt gap above the floating pill; this was doubling it.
  },
  // Pill buttons — full stadium radius, 52pt tall, real Liquid Glass fills
  // (GlassIconBg with borderRadius 999).
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 26,
    overflow: 'hidden',
  },
  actionBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: C.onPrimary,
  },
  actionBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 26,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: C.hairline,
  },
  actionBtnOutlineText: {
    fontSize: 15,
    fontWeight: '700',
  },
  // In-content outline button (visits section's "Log another visit") — not
  // part of the pinned glass bar.
  actionBtnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'transparent',
    borderRadius: 12,
    overflow: 'hidden',
    paddingVertical: 11,
    borderWidth: 1.5,
  },
  bucketCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: C.hairline,
  },
  divider: {
    height: 0.5,
    backgroundColor: C.hairline,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 0,
  },

  // Section
  section: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: C.ink,
    letterSpacing: -0.2,
    marginBottom: 12,
  },
  bodyText: {
    fontSize: 13.5,
    color: C.inkSoft,
    lineHeight: 20,
  },

  // Chip grid
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
    backgroundColor: C.surface,
    borderWidth: 0.5,
    borderColor: C.hairline,
  },
  chipMuted: {
    backgroundColor: C.surfaceAlt,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.inkSoft,
  },
  chipTextMuted: {
    color: C.inkMute,
    fontWeight: '500',
  },
  chipExpand: {
    backgroundColor: 'transparent',
  },
  chipExpandText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Hours
  hoursCard: {
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: C.hairline,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  hoursName: {
    fontSize: 13,
    fontWeight: '700',
    color: C.inkMute,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  hoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  hoursDay: {
    fontSize: 13,
    fontWeight: '500',
    color: C.inkSoft,
  },
  hoursVal: {
    fontSize: 13,
    color: C.inkMute,
    fontWeight: '400',
  },

  // Fees
  feeRow: {
    backgroundColor: C.surface,
    borderRadius: 10,
    padding: 12,
    borderWidth: 0.5,
    borderColor: C.hairline,
  },
  feeName: {
    fontSize: 13,
    fontWeight: '700',
    color: C.ink,
  },
  feeCost: {
    fontSize: 13,
    fontWeight: '700',
  },
  feeDesc: {
    fontSize: 13,
    color: C.inkMute,
    lineHeight: 17,
    marginTop: 4,
  },

  // Links / contact
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  linkBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  contactText: {
    fontSize: 13,
    color: C.ink,
    flex: 1,
  },

  // Weather
  weatherCard: {
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: C.hairline,
    padding: 12,
    width: 96,
    alignItems: 'center',
  },
  weatherDay: {
    fontSize: 13,
    fontWeight: '700',
    color: C.inkMute,
    letterSpacing: 0.3,
    marginBottom: 6,
    textAlign: 'center',
  },
  weatherEmoji: {
    fontSize: 26,
    marginBottom: 4,
  },
  weatherTemp: {
    fontSize: 17,
    fontWeight: '800',
    color: C.ink,
  },
  weatherLow: {
    fontSize: 13,
    color: C.inkMute,
    marginTop: 1,
    marginBottom: 6,
  },
  weatherDesc: {
    fontSize: 13,
    color: C.inkMute,
    textAlign: 'center',
    lineHeight: 13,
    marginTop: 4,
  },

  // Journal
  journalEmpty: {
    alignItems: 'center',
    paddingTop: 32,
    paddingBottom: 28,
    paddingHorizontal: 24,
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: C.hairline,
  },
  journalEmptyBtn: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    paddingVertical: 13,
  },
  visitCard: {
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: C.hairline,
    padding: 14,
  },
  visitDate: {
    fontSize: 13,
    fontWeight: '600',
    color: C.inkMute,
    letterSpacing: 0.2,
  },
  visitTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: C.ink,
    marginBottom: 4,
  },
  visitNotes: {
    fontSize: 13,
    color: C.inkSoft,
    lineHeight: 19,
  },
  visitPhoto: {
    width: 90,
    height: 70,
    borderRadius: 8,
  },

  // Attribution
  attribution: {
    marginHorizontal: 16,
    paddingVertical: 20,
    borderTopWidth: 0.5,
    borderTopColor: C.hairline,
    marginTop: 8,
  },
  attributionText: {
    fontSize: 13,
    color: C.inkMute,
    lineHeight: 16,
    textAlign: 'center',
  },
  attributionLink: {
    textDecorationLine: 'underline',
  },

  // Location mini-map
  miniMapContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: C.hairline,
    height: 200,
  },
  miniMap: {
    flex: 1,
  },
  viewOnMapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 11,
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: C.hairline,
  },
  viewOnMapBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
