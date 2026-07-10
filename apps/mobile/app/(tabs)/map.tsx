import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated, DeviceEventEmitter, Dimensions, Keyboard, Linking, PanResponder, Platform,
  Pressable, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
  type ColorValue,
} from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { fullStateName } from '@/lib/stateNames';
import { parkGradient } from '@/lib/parkColors';
import { ImageLightbox } from '@/components/ImageLightbox';
import { STATIC as C, dyn, useColors } from '@/lib/palette';
import { CompassSpinner } from '@/components/LoadingScreen';
import { useTabBarSpace } from '@/components/FloatingTabBar';
import { loadOfflineParks, saveOfflineParks } from '@/lib/offlineParks';
import { OfflineBanner } from '@/components/OfflineBanner';
import { useIsOnline } from '@/lib/network';
import { Avatar } from '@/components/Avatar';
import type { ParkVisitorsSummary } from '@/lib/api';
import { showToast } from '@/lib/toast';

// Not-yet-visited marker gray — map-only, not part of the shared palette
const UNVISITED = '#A8A29A';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');

const SHEET_PEEK = SCREEN_H * 0.48;
const SHEET_FULL = SCREEN_H;

// ── Types ─────────────────────────────────────────────────────────────────────

type ParkStatus = 'visited' | 'bucketList' | 'notVisited';
type FilterStatus = 'all' | 'visited' | 'bucketList' | 'notVisited';

interface VisitEntry {
  id: number;
  visited_date: string;
  end_date?: string | null;
  title?: string | null;
  notes?: string | null;
}

interface FullVisit {
  id: number;
  visited_date: string;
  end_date?: string | null;
  title?: string | null;
  notes?: string | null;
  rating?: number | null;
  photos?: string[] | null;
}

interface OperatingHours {
  name: string;
  description: string;
  standardHours: Record<string, string>;
}

interface WeatherPeriod {
  name: string;
  temperature: number;
  temperatureUnit: string;
  shortForecast: string;
  isDaytime: boolean;
}

interface ParkForMap {
  park_code: string;
  name: string;
  states: string;
  latitude: number;
  longitude: number;
  status: ParkStatus;
  description?: string | null;
  image_url?: string | null;
  visits?: VisitEntry[];
  title?: string | null;
  notes?: string | null;
  photos?: string[] | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Carries the park's name/states/image along so the log-visit modal can render its
// "Where" banner filled in on the first frame, instead of waiting on its own /api/parks fetch.
function logVisitParams(park: { park_code: string; name: string; states: string; image_url?: string | null }) {
  return { parkCode: park.park_code, parkName: park.name, parkStates: park.states, parkImageUrl: park.image_url ?? '' };
}


function markerConfig(status: ParkStatus, selected: boolean) {
  const color =
    status === 'visited'    ? C.visited :
    status === 'bucketList' ? C.bucket  : UNVISITED;
  const dotR  = selected ? 10 : status === 'visited' ? 7.5 : 6;
  const haloR = selected ? 17 : status === 'visited' ? 13  : 10;
  const haloOpacity = selected ? 0.24 : 0.15;
  return { color, dotR, haloR, haloOpacity };
}

function formatDateRange(start: string, end?: string | null): string {
  const s = new Date(start);
  const opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' };
  if (!end) return s.toLocaleDateString('en-US', opts);
  const e = new Date(end);
  const days = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
  return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}–${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · ${days}d`;
}

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

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

// ── ParkMarker ────────────────────────────────────────────────────────────────

function ParkMarker({ park, selected }: { park: ParkForMap; selected: boolean }) {
  const { color, dotR, haloR, haloOpacity } = markerConfig(park.status, selected);
  const sz = haloR * 2;
  return (
    <View style={{ width: sz, height: sz, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{
        position: 'absolute',
        width: sz, height: sz, borderRadius: haloR,
        backgroundColor: color, opacity: haloOpacity,
      }} />
      <View style={{
        width: dotR * 2, height: dotR * 2, borderRadius: dotR,
        backgroundColor: color,
        borderWidth: selected ? 2 : 1.5,
        borderColor: C.surface,
      }} />
    </View>
  );
}

// Marker is normally rendered with tracksViewChanges={false} — once placed, its
// native view is snapshotted to a static bitmap and never re-rendered, which is
// what keeps a map of 60+ pins smooth. But react-native-maps only refreshes that
// bitmap while tracksViewChanges is true, so if we leave it permanently false a
// status flip (e.g. right after logging a visit) never gets painted — worse, on
// Android the marker can go fully blank mid-transition instead of just staying
// stale. So: flip tracksViewChanges on for a beat whenever this park's status
// changes, long enough for react-native-maps to re-snapshot the new color, then
// drop back to false.
function ParkMapMarker({
  park, selected, onSelect,
}: { park: ParkForMap; selected: boolean; onSelect: (park: ParkForMap) => void }) {
  const prevStatus = useRef(park.status);
  const [justChanged, setJustChanged] = useState(false);

  useEffect(() => {
    if (prevStatus.current === park.status) return;
    prevStatus.current = park.status;
    setJustChanged(true);
    const t = setTimeout(() => setJustChanged(false), 300);
    return () => clearTimeout(t);
  }, [park.status]);

  return (
    <Marker
      coordinate={{ latitude: park.latitude, longitude: park.longitude }}
      onPress={e => { e.stopPropagation(); onSelect(park); }}
      tracksViewChanges={selected || justChanged}
      anchor={{ x: 0.5, y: 0.5 }}
    >
      <ParkMarker park={park} selected={selected} />
    </Marker>
  );
}

// ── FilterPill ────────────────────────────────────────────────────────────────

const FILTERS: Array<{ key: FilterStatus; dot: ColorValue; label: string }> = [
  { key: 'all',        dot: C.ink,       label: 'ALL'    },
  { key: 'visited',    dot: C.visited,   label: 'VISITED'},
  { key: 'bucketList', dot: C.bucket,    label: 'BUCKET' },
  { key: 'notVisited', dot: UNVISITED, label: 'TO GO'  },
];

function FilterPill({
  active, counts, onSelect,
}: {
  active: FilterStatus;
  counts: Record<FilterStatus, number>;
  onSelect: (f: FilterStatus) => void;
}) {
  return (
    <View style={styles.pill}>
      {FILTERS.map((f, i) => (
        <View key={f.key} style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
          <TouchableOpacity
            onPress={() => onSelect(f.key)}
            activeOpacity={0.7}
            style={[styles.pillBtn, styles.pillBtnFlex, active === f.key && styles.pillBtnActive]}
          >
            <View style={[styles.pillDot, { backgroundColor: f.dot }]} />
            <Text style={[styles.pillCount, active === f.key && styles.pillCountActive]}>
              {counts[f.key]}
            </Text>
            <Text
              numberOfLines={1}
              style={[styles.pillLabel, active === f.key && styles.pillLabelActive]}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
          {i < FILTERS.length - 1 && <View style={styles.pillDivider} />}
        </View>
      ))}
    </View>
  );
}

// ── Search bar ────────────────────────────────────────────────────────────────

interface UserSearchResult {
  clerk_user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

function MapSearchBar({
  token, parks, closeSignal, onSelectPark, onSelectUser,
}: {
  token: string | null;
  parks: ParkForMap[];
  closeSignal: number;
  onSelectPark: (p: ParkForMap) => void;
  onSelectUser: (clerkUserId: string) => void;
}) {
  const [query, setQuery]             = useState('');
  const [userResults, setUserResults] = useState<UserSearchResult[]>([]);
  const [parkResults, setParkResults] = useState<ParkForMap[]>([]);
  const [open, setOpen]               = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  // Close dropdown when the map is tapped
  useEffect(() => {
    if (closeSignal > 0) { setOpen(false); Keyboard.dismiss(); }
  }, [closeSignal]);

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) { setUserResults([]); setParkResults([]); setOpen(false); return; }
    const mySeq = ++seq.current;
    const lower = trimmed.toLowerCase();
    const matchedParks = parks.filter(p =>
      p.name.toLowerCase().includes(lower) ||
      p.states.toLowerCase().includes(lower) ||
      fullStateName(p.states.split(',')[0].trim()).toLowerCase().includes(lower)
    ).slice(0, 5);
    let matchedUsers: UserSearchResult[] = [];
    if (token) {
      try {
        matchedUsers = await apiFetch<UserSearchResult[]>(
          `/api/users?q=${encodeURIComponent(trimmed)}&limit=5`, token
        );
      } catch { /* ignore */ }
    }
    if (mySeq !== seq.current) return;
    setParkResults(matchedParks);
    setUserResults(matchedUsers.slice(0, 5));
    setOpen(matchedParks.length > 0 || matchedUsers.length > 0);
  }, [parks, token]);

  const handleChange = (q: string) => {
    setQuery(q);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => runSearch(q), 250);
  };

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    setQuery('');
    setUserResults([]);
    setParkResults([]);
    setOpen(false);
    Keyboard.dismiss();
  };

  return (
    <View>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color={C.inkMute} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={handleChange}
          onFocus={() => { if (userResults.length > 0 || parkResults.length > 0) setOpen(true); }}
          placeholder="Search parks or users…"
          placeholderTextColor={C.inkMute}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={clear} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={C.inkMute} />
          </TouchableOpacity>
        )}
      </View>

      {open && (
        <View style={styles.searchResults}>
          {parkResults.length > 0 && (
            <>
              <Text style={styles.searchSectionTitle}>PARKS</Text>
              {parkResults.map(p => (
                <TouchableOpacity
                  key={p.park_code}
                  style={styles.searchRow}
                  onPress={() => { clear(); onSelectPark(p); }}
                  activeOpacity={0.7}
                >
                  <View style={styles.searchRowIcon}>
                    <Ionicons name="location" size={15} color={C.visited} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.searchRowTitle} numberOfLines={1}>{p.name}</Text>
                    <Text style={styles.searchRowSub} numberOfLines={1}>{p.states}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </>
          )}
          {userResults.length > 0 && (
            <>
              <Text style={styles.searchSectionTitle}>USERS</Text>
              {userResults.map(u => (
                <TouchableOpacity
                  key={u.clerk_user_id}
                  style={styles.searchRow}
                  onPress={() => { clear(); onSelectUser(u.clerk_user_id); }}
                  activeOpacity={0.7}
                >
                  {u.avatar_url ? (
                    <Image source={{ uri: u.avatar_url }} style={styles.searchRowAvatar} />
                  ) : (
                    <View style={styles.searchRowIcon}>
                      <Ionicons name="person" size={14} color={C.inkMute} />
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.searchRowTitle} numberOfLines={1}>
                      {u.display_name ?? (u.username ? `@${u.username}` : 'User')}
                    </Text>
                    {u.display_name && u.username ? (
                      <Text style={styles.searchRowSub} numberOfLines={1}>@{u.username}</Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              ))}
            </>
          )}
        </View>
      )}
    </View>
  );
}

// ── Section header (for full-profile sections) ────────────────────────────────

function SheetSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.profileSection}>
      <Text style={styles.profileSectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

// ── Stars ─────────────────────────────────────────────────────────────────────

function Stars({ value }: { value: number }) {
  const C = useColors();
  return (
    <View style={{ flexDirection: 'row', gap: 1 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Ionicons key={i} name={i < Math.round(value) ? 'star' : 'star-outline'} size={11} color={C.accent} />
      ))}
    </View>
  );
}

// ── StatCell ──────────────────────────────────────────────────────────────────

function StatCell({ label, value, valueColor }: { label: string; value: string; valueColor?: ColorValue }) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

// ── FriendsVisitedRow (mutuals) ───────────────────────────────────────────────
// Same component as parks/[id].tsx's — duplicated locally rather than shared,
// matching how StatCell/ChipGrid are already duplicated per screen in this file.

function FriendsVisitedRow({ friends, total }: { friends: ParkVisitorsSummary['friends']; total: number }) {
  const shown = friends.slice(0, 3);
  return (
    <View style={styles.mutualsRow}>
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
      <Text style={styles.mutualsText}>
        {total} {total === 1 ? 'friend has' : 'friends have'} visited
      </Text>
    </View>
  );
}

// ── ChipGrid ──────────────────────────────────────────────────────────────────

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
        <View key={item} style={[styles.activityChip, muted && { backgroundColor: 'transparent' }]}>
          <Text style={[styles.activityChipText, muted && { color: C.inkMute }]}>{item}</Text>
        </View>
      ))}
      {items.length > limit && !expanded && (
        <TouchableOpacity onPress={() => setExpanded(true)} style={[styles.activityChip, styles.chipExpand, { borderColor: C.primary }]}>
          <Text style={[styles.chipExpandText, { color: C.primary }]}>+{hidden} more</Text>
        </TouchableOpacity>
      )}
      {expanded && items.length > limit && (
        <TouchableOpacity onPress={() => setExpanded(false)} style={[styles.activityChip, styles.chipExpand, { borderColor: C.primary }]}>
          <Text style={[styles.chipExpandText, { color: C.primary }]}>Show less</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── ParkBottomSheet ───────────────────────────────────────────────────────────

function ParkBottomSheet({
  park,
  token,
  onClose,
  onDismissStart,
  onStatusChange,
}: {
  park: ParkForMap;
  token: string;
  onClose: () => void;
  onDismissStart: () => void;
  onStatusChange: (code: string, status: ParkStatus) => void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const C = useColors();
  const isOnline = useIsOnline();
  const sheetH   = useRef(new Animated.Value(0)).current;
  const baseH    = useRef(SHEET_PEEK);
  const scrollY  = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<any>(null);

  const sheetRadius = sheetH.interpolate({
    inputRange: [SHEET_FULL - 60, SHEET_FULL],
    outputRange: [28, 0],
    extrapolate: 'clamp',
  });

  // Image carousel — auto-rotates like the park detail page hero
  const [npsImages, setNpsImages] = useState<string[]>(
    park.image_url ? [park.image_url] : []
  );
  // Parallel to npsImages (same order/length) — captions for the lightbox, same
  // source data as the park detail page's gallery.
  const [npsImageTitles, setNpsImageTitles] = useState<(string | null)[]>([]);
  const [imgIdx, setImgIdx] = useState(0);
  const [heroLoaded, setHeroLoaded] = useState(false);
  const [prevHeroUrl, setPrevHeroUrl] = useState<string | null>(null);
  const prevHeroRef = useRef<string | null>(null);
  // Title only needs to clamp to one line once the header has collapsed enough
  // that a wrapped name would get clipped — full-height it wraps freely, same
  // as the park detail page.
  const [titleCollapsed, setTitleCollapsed] = useState(false);
  const titleCollapsedRef = useRef(false);
  const npsImagesRef = useRef<string[]>(npsImages);
  npsImagesRef.current = npsImages;

  // NPS summary data
  const [npsActivities,    setNpsActivities]    = useState<string[]>([]);
  const [npsTopics,        setNpsTopics]        = useState<string[]>([]);
  const [npsEntranceFees,  setNpsEntranceFees]  = useState<Array<{ title: string; cost: string; description?: string }>>([]);
  const [npsFeesFree,      setNpsFeesFree]      = useState<boolean | null>(null);
  const [npsHours,         setNpsHours]         = useState<OperatingHours[]>([]);
  const [npsDirectionsInfo,setNpsDirectionsInfo]= useState<string | null>(null);
  const [npsDirectionsUrl, setNpsDirectionsUrl] = useState<string | null>(null);
  const [npsPhone,         setNpsPhone]         = useState<string | null>(null);
  const [npsEmail,         setNpsEmail]         = useState<string | null>(null);
  const [npsWebUrl,        setNpsWebUrl]        = useState<string | null>(null);
  const [npsWeatherInfo,   setNpsWeatherInfo]   = useState<string | null>(null);

  // Weather
  const [weather, setWeather] = useState<WeatherPeriod[] | null>(null);

  // Friends who've visited (mutuals) — no offline cache for this (per-user/live
  // data), so it's simply not fetched/hidden while offline, same as the detail page.
  const [visitors, setVisitors] = useState<ParkVisitorsSummary | null>(null);

  // Full visits (with rating + photos)
  const [fullVisits,       setFullVisits]       = useState<FullVisit[]>([]);
  const [expandedVisits,   setExpandedVisits]   = useState<Set<number>>(new Set());

  // Action state
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [lightboxIdx, setLightboxIdx]     = useState<number | null>(null);

  // Scroll-to-expand state
  const sheetFullRef    = useRef(false);
  const [scrollEnabled, setScrollEnabled] = useState(false);
  const dismissingRef   = useRef(false);
  const scrollOffsetRef = useRef(0);

  // ── Animate in ───────────────────────────────────────────────────────────────

  useEffect(() => {
    sheetFullRef.current = false;
    dismissingRef.current = false;
    setScrollEnabled(false);
    scrollRef.current?.scrollTo?.({ y: 0, animated: false });
    scrollOffsetRef.current = 0;
    baseH.current = SHEET_PEEK;
    sheetH.setValue(0);
    Animated.spring(sheetH, {
      toValue: SHEET_PEEK, useNativeDriver: false,
      damping: 30, mass: 0.9, stiffness: 200,
    }).start();
  }, [park.park_code]);

  // ── Load NPS data ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (park.image_url) setNpsImages([park.image_url]);
    else setNpsImages([]);
    setNpsImageTitles([]);
    setImgIdx(0);
    setHeroLoaded(false);
    setPrevHeroUrl(null);
    prevHeroRef.current = null;
    setNpsActivities([]);
    setNpsTopics([]);
    setNpsEntranceFees([]);
    setNpsFeesFree(null);
    setNpsHours([]);
    setNpsDirectionsInfo(null);
    setNpsDirectionsUrl(null);
    setNpsPhone(null);
    setNpsEmail(null);
    setNpsWebUrl(null);
    setNpsWeatherInfo(null);
    setExpandedVisits(new Set());

    fetch(`${BASE}/api/parks/${park.park_code}/images`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const rawImages: { url: string; title?: string | null }[] = (data?.images ?? []).filter((img: { url?: string }) => img?.url);
        const urls = rawImages.map(img => img.url);
        if (urls.length > 0) {
          setNpsImages(urls);
          setNpsImageTitles(rawImages.map(img => img.title ?? null));
        }
      })
      .catch(() => {});

    fetch(`${BASE}/api/parks/${park.park_code}/nps`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then((data: {
        designation?: string;
        activities?: string[];
        topics?: string[];
        entranceFees?: Array<{ title: string; cost: string; description?: string }>;
        operatingHours?: OperatingHours[];
        directionsInfo?: string;
        directionsUrl?: string;
        phone?: string;
        email?: string;
        url?: string;
        weatherInfo?: string;
      } | null) => {
        if (!data) return;
        setNpsActivities(data.activities ?? []);
        setNpsTopics(data.topics ?? []);
        setNpsEntranceFees(data.entranceFees ?? []);
        setNpsFeesFree((data.entranceFees ?? []).length === 0);
        setNpsHours(data.operatingHours ?? []);
        setNpsDirectionsInfo(data.directionsInfo ?? null);
        setNpsDirectionsUrl(data.directionsUrl ?? null);
        setNpsPhone(data.phone ?? null);
        setNpsEmail(data.email ?? null);
        setNpsWebUrl(data.url ?? null);
        setNpsWeatherInfo(data.weatherInfo ?? null);
      })
      .catch(() => {});
  }, [park.park_code, token, park.image_url]);

  // ── Load weather ──────────────────────────────────────────────────────────────

  useEffect(() => {
    setWeather(null);
    fetch(`${BASE}/api/parks/${park.park_code}/weather`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.periods) setWeather(data.periods);
      })
      .catch(() => {});
  }, [park.park_code, token]);

  // ── Load full visits ──────────────────────────────────────────────────────────
  // Re-runs when `park.status` flips (e.g. right after logging a visit updates the
  // live park object from the parent's list) so "Your Journal" and the visit count
  // pick up the new entry instantly, without needing the sheet to be reopened.
  useEffect(() => {
    fetch(`${BASE}/api/visits`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then((visits: Array<FullVisit & { park_code: string; is_bucket_list: boolean }>) => {
        const mine = visits
          .filter(v => v.park_code === park.park_code && !v.is_bucket_list && v.visited_date)
          .sort((a, b) => new Date(b.visited_date).getTime() - new Date(a.visited_date).getTime());
        setFullVisits(mine);
      })
      .catch(() => {});
  }, [park.park_code, token, park.status]);

  // ── Load friends-who-visited (mutuals) ────────────────────────────────────────
  // Skipped entirely while offline — this is per-user/live data, not park
  // content, so there's nothing cached to fall back to; it just stays hidden.

  useEffect(() => {
    setVisitors(null);
    if (!isOnline) return;

    fetch(`${BASE}/api/parks/${park.park_code}/visitors`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then((data: ParkVisitorsSummary | null) => { if (data) setVisitors(data); })
      .catch(() => {});
  }, [park.park_code, token, isOnline]);

  // ── Sheet snap / dismiss ──────────────────────────────────────────────────────

  function snapTo(target: number) {
    const full = target >= SHEET_FULL;
    sheetFullRef.current = full;
    setScrollEnabled(full);
    if (!full) {
      scrollRef.current?.scrollTo?.({ y: 0, animated: false });
      scrollOffsetRef.current = 0;
    }
    Animated.spring(sheetH, {
      toValue: target, useNativeDriver: false,
      damping: 22, mass: 0.75, stiffness: 260,
    }).start();
    baseH.current = target;
  }

  function dismiss() {
    if (dismissingRef.current) return;
    dismissingRef.current = true;
    sheetFullRef.current = false;
    setScrollEnabled(false);
    onDismissStart();
    Animated.timing(sheetH, {
      toValue: 0, duration: 260, useNativeDriver: false,
    }).start(onClose);
  }

  // Rubber-band resistance for drags that go below SHEET_PEEK.
  // Returns the next sheet height with exponential damping below peek.
  function rubberBandHeight(raw: number): number {
    if (raw >= SHEET_PEEK) return Math.min(SHEET_FULL, raw);
    const overshoot = SHEET_PEEK - raw;
    // 0.22 coefficient: only ~22% of each extra pixel gets through
    return Math.max(40, SHEET_PEEK - overshoot * 0.22);
  }

  // ── Top-strip pan handler ─────────────────────────────────────────────────────
  // Drag handle at the top of the sheet controls vertical snap/dismiss.

  const topStripPan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, { dy, dx }) =>
      !dismissingRef.current && Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx),
    onPanResponderGrant: () => {
      sheetH.stopAnimation(v => { baseH.current = v; });
    },
    onPanResponderMove: (_, { dy }) => {
      sheetH.setValue(rubberBandHeight(baseH.current - dy));
    },
    onPanResponderRelease: (_, { dy, vy }) => {
      const raw = baseH.current - dy;
      const mid = (SHEET_PEEK + SHEET_FULL) / 2;
      // Decisive downward flick or a drag below the peek zone closes the sheet
      if (vy > 1.2 || raw < SHEET_PEEK * 0.65) {
        dismiss();
      } else if (vy < -0.5 || raw > mid) {
        snapTo(SHEET_FULL);
      } else {
        snapTo(SHEET_PEEK);
      }
    },
  })).current;

  // ── Content pan handler ───────────────────────────────────────────────────────
  // When sheet is not full, vertical drags move the sheet instead of scrolling.
  // When full, a downward drag with the scroll already at the top grabs the
  // sheet (same pattern as the comments sheet), so header + text move as one.
  // Uses refs so the PanResponder closure always sees current state.

  const contentPan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, { dy, dx }) => {
      if (dismissingRef.current) return false;
      if (Math.abs(dy) <= 8 || Math.abs(dy) <= Math.abs(dx)) return false;
      if (!sheetFullRef.current) return true;
      return scrollOffsetRef.current <= 1 && dy > 0;
    },
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      sheetH.stopAnimation(v => { baseH.current = v; });
    },
    onPanResponderMove: (_, { dy }) => {
      // dy < 0 = swipe up = expand; dy > 0 = swipe down = rubber-band resist
      sheetH.setValue(rubberBandHeight(baseH.current - dy));
    },
    onPanResponderRelease: (_, { dy, vy }) => {
      const raw = baseH.current - dy;
      const mid = (SHEET_PEEK + SHEET_FULL) / 2;
      if (vy > 2.5 || (vy > 1.2 && raw < SHEET_PEEK * 0.65)) {
        dismiss();
      } else if (vy < -0.5 || raw > mid) {
        snapTo(SHEET_FULL);
      } else {
        snapTo(SHEET_PEEK);
      }
    },
  })).current;

  // ── Actions ───────────────────────────────────────────────────────────────────

  const handleBucketList = async () => {
    if (actionLoading) return;
    setActionLoading('bucket');
    // Flip the button/dot instantly and only fire the request in the background —
    // reverting it is the rare path (request failure), so don't make every tap wait
    // on a round trip first.
    const prevStatus = park.status;
    const nextStatus: ParkStatus = prevStatus === 'bucketList' ? 'notVisited' : 'bucketList';
    onStatusChange(park.park_code, nextStatus);
    try {
      const res = prevStatus === 'bucketList'
        ? await fetch(`${BASE}/api/visits?park_code=${park.park_code}`, {
            method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
          })
        : await fetch(`${BASE}/api/visits`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ park_code: park.park_code, is_bucket_list: true }),
          });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      onStatusChange(park.park_code, prevStatus);
      showToast("Couldn't update bucket list — please try again", 'error');
    }
    setActionLoading(null);
  };

  // ── Derived ───────────────────────────────────────────────────────────────────

  const heroUrl      = npsImages[imgIdx] ?? null;
  const stateLabel   = fullStateName(park.states.split(',')[0].trim());
  const tabBarH      = useTabBarSpace();
  const forecastDays = (weather ?? []).filter(p => p.isDaytime).slice(0, 7);
  const forecastNights = (weather ?? []).filter(p => !p.isDaytime);
  const hasContact   = npsPhone || npsEmail || npsWebUrl;

  // Photo strip shows the next images relative to the rotating hero
  const stripImages: Array<{ url: string; actualIdx: number }> = [];
  if (npsImages.length >= 2) {
    const stripCount = Math.min(npsImages.length - 1, 4);
    for (let i = 0; i < stripCount; i++) {
      const actualIdx = (imgIdx + 1 + i) % npsImages.length;
      stripImages.push({ url: npsImages[actualIdx], actualIdx });
    }
  }

  // Keep the previous hero visible behind the incoming one for a cross-dissolve
  useEffect(() => {
    if (!heroUrl) return;
    if (prevHeroRef.current !== heroUrl) {
      setPrevHeroUrl(prevHeroRef.current);
      prevHeroRef.current = heroUrl;
    }
  }, [heroUrl]);

  // Auto-advance the hero every 5s once the first image has loaded
  useEffect(() => {
    if (!heroLoaded || npsImages.length < 2) return;
    const tid = setInterval(() => {
      setImgIdx(prev => (prev + 1) % npsImagesRef.current.length);
    }, 5000);
    return () => clearInterval(tid);
  }, [heroLoaded, npsImages.length]);

  // ── Collapsing header animations ─────────────────────────────────────────────

  // Matches the hero height on the park detail page (parks/[id].tsx), extended
  // by insets.top so the image reaches the true top of the screen (sheet itself
  // goes to y=0) instead of leaving a gap above the status bar. Only applies at
  // full screen — the sheet doesn't reach the top edge at peek, so that image
  // stays shorter to leave room for the stat row below it.
  const BANNER_H = 260 + insets.top;
  const PEEK_BANNER_H = 200;
  // Collapsed bar sits below the status bar / dynamic island
  const COLLAPSED_H = insets.top + 56;

  // Grows the banner from its peek size up to full size as the sheet itself
  // is dragged/snapped from SHEET_PEEK to SHEET_FULL...
  const sheetBannerH = sheetH.interpolate({
    inputRange: [SHEET_PEEK, SHEET_FULL],
    outputRange: [PEEK_BANNER_H, BANNER_H],
    extrapolate: 'clamp',
  });
  // ...then, once full, collapses further as the user scrolls the body up.
  const scrollCollapse = scrollY.interpolate({
    inputRange: [0, BANNER_H - COLLAPSED_H],
    outputRange: [0, BANNER_H - COLLAPSED_H],
    extrapolate: 'clamp',
  });
  const headerHeight = Animated.subtract(sheetBannerH, scrollCollapse);
  // Scale + translate instead of animating fontSize/paddingLeft directly —
  // those force a native layout + text remeasure on every scroll frame, which
  // is what made the collapse look glitchy/jumpy. Transforms are composited,
  // no layout pass involved, so this reaches 60fps even under the JS driver
  // `headerHeight` (height) requires above.
  const heroTitleScale = scrollY.interpolate({
    inputRange: [0, (BANNER_H - COLLAPSED_H) * 0.75],
    outputRange: [1, 20 / 28],
    extrapolate: 'clamp',
  });
  const stateOpacity = scrollY.interpolate({
    inputRange: [0, (BANNER_H - COLLAPSED_H) * 0.45],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  // Shift the collapsed title right so it clears the back button — delta only;
  // the base 20px left padding stays put, this adds the remaining 40px.
  const heroTitleTranslateX = scrollY.interpolate({
    inputRange: [0, (BANNER_H - COLLAPSED_H) * 0.75],
    outputRange: [0, 40],
    extrapolate: 'clamp',
  });

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      <Pressable style={styles.backdrop} onPress={dismiss} />

      <Animated.View style={[styles.sheet, { height: sheetH, borderTopLeftRadius: sheetRadius, borderTopRightRadius: sheetRadius }]}>
        <View style={{ flex: 1 }} {...contentPan.panHandlers}>
        <Animated.ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          scrollEnabled={scrollEnabled}
          bounces={false}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            {
              useNativeDriver: false,
              listener: (e: any) => {
                const y = e.nativeEvent.contentOffset.y;
                scrollOffsetRef.current = y;
                const collapsed = y > (BANNER_H - COLLAPSED_H) * 0.5;
                if (collapsed !== titleCollapsedRef.current) {
                  titleCollapsedRef.current = collapsed;
                  setTitleCollapsed(collapsed);
                }
              },
            }
          )}
          contentContainerStyle={{ paddingTop: scrollEnabled ? BANNER_H : PEEK_BANNER_H }}
        >
          {/* Body content */}
          <View style={styles.sheetBody}>

          {/* ── Quick stats ── */}
          <View style={styles.statsRow}>
            <StatCell label="State" value={fullStateName(park.states)} />
            <View style={styles.statDivider} />
            <StatCell
              label="Status"
              value={park.status === 'visited' ? 'Visited' : park.status === 'bucketList' ? 'Bucket list' : 'Not yet'}
              valueColor={park.status === 'visited' ? C.visited : park.status === 'bucketList' ? C.bucket : C.inkMute}
            />
            <View style={styles.statDivider} />
            <StatCell label="Visits" value={String(fullVisits.length)} />
          </View>

          {/* ── Friends who've visited ── */}
          {isOnline && visitors && visitors.total > 0 && (
            <FriendsVisitedRow friends={visitors.friends} total={visitors.total} />
          )}

          {/* ── Photo strip — next images relative to the rotating hero ── */}
          {stripImages.length > 0 && (
            <ScrollView
              horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.photoStrip}
            >
              {stripImages.map(({ url, actualIdx }, slotIdx) => (
                <TouchableOpacity
                  key={slotIdx}
                  onPress={() => setLightboxIdx(actualIdx)}
                  activeOpacity={0.85}
                  style={styles.photoStripItem}
                >
                  <LinearGradient
                    colors={parkGradient(park.park_code)}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <Image
                    source={{ uri: url }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    transition={800}
                    cachePolicy="memory-disk"
                  />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* ── About ── */}
          {park.description ? (
            <SheetSection title="About">
              <Text style={styles.sectionBody}>{park.description}</Text>
            </SheetSection>
          ) : null}

          {/* ── Activities ── */}
          {npsActivities.length > 0 && (
            <SheetSection title="Activities">
              <ChipGrid items={npsActivities} />
            </SheetSection>
          )}

          {/* ── Topics ── */}
          {npsTopics.length > 0 && (
            <SheetSection title="Topics">
              <ChipGrid items={npsTopics} muted />
            </SheetSection>
          )}

          {/* ── Operating hours ── */}
          {npsHours.length > 0 && (
            <SheetSection title="Operating Hours">
              {npsHours.map((h, hi) => (
                <View key={hi} style={[styles.hoursCard, hi < npsHours.length - 1 && { marginBottom: 10 }]}>
                  {npsHours.length > 1 && (
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
                    <Text style={[styles.sectionBody, { marginTop: 10 }]}>
                      {h.description}
                    </Text>
                  ) : null}
                </View>
              ))}
            </SheetSection>
          )}

          {/* ── Entrance fees ── */}
          {npsFeesFree !== null && (
            <SheetSection title="Entrance">
              {npsFeesFree ? (
                <Text style={[styles.sectionBody, { fontWeight: '500' }]}>Free to visit</Text>
              ) : (
                <View style={{ gap: 8 }}>
                  {npsEntranceFees.map((fee, i) => (
                    <View key={i} style={styles.feeCard}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: fee.description ? 4 : 0 }}>
                        <Text style={styles.feeName}>{fee.title || 'Entrance'}</Text>
                        <Text style={[styles.feeCost, { color: C.primary }]}>
                          {fee.cost === '0.00' || fee.cost === '0' ? 'Free' : `$${parseFloat(fee.cost).toFixed(0)}`}
                        </Text>
                      </View>
                      {fee.description ? (
                        <Text style={styles.feeDesc} numberOfLines={2}>{fee.description}</Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              )}
            </SheetSection>
          )}

          {/* ── Directions ── */}
          {npsDirectionsInfo ? (
            <SheetSection title="Directions">
              <Text style={styles.sectionBody}>{npsDirectionsInfo}</Text>
              {npsDirectionsUrl ? (
                <TouchableOpacity
                  onPress={() => Linking.openURL(npsDirectionsUrl!)}
                  style={styles.linkBtn}
                >
                  <Ionicons name="navigate-outline" size={13} color={C.primary} />
                  <Text style={[styles.linkBtnText, { color: C.primary }]}>Open directions</Text>
                </TouchableOpacity>
              ) : null}
            </SheetSection>
          ) : null}

          {/* ── Contact ── */}
          {hasContact ? (
            <SheetSection title="Contact">
              <View style={{ gap: 10 }}>
                {npsPhone ? (
                  <TouchableOpacity
                    style={styles.contactRow}
                    onPress={() => Linking.openURL(`tel:${npsPhone!.replace(/\D/g, '')}`)}
                  >
                    <Ionicons name="call-outline" size={14} color={C.inkMute} />
                    <Text style={styles.contactText}>{npsPhone}</Text>
                  </TouchableOpacity>
                ) : null}
                {npsEmail ? (
                  <TouchableOpacity
                    style={styles.contactRow}
                    onPress={() => Linking.openURL(`mailto:${npsEmail}`)}
                  >
                    <Ionicons name="mail-outline" size={14} color={C.inkMute} />
                    <Text style={styles.contactText}>{npsEmail}</Text>
                  </TouchableOpacity>
                ) : null}
                {npsWebUrl ? (
                  <TouchableOpacity
                    style={styles.contactRow}
                    onPress={() => Linking.openURL(npsWebUrl!)}
                  >
                    <Ionicons name="globe-outline" size={14} color={C.inkMute} />
                    <Text style={styles.contactText}>NPS Website</Text>
                    <Ionicons name="arrow-forward" size={10} color={C.inkMute} />
                  </TouchableOpacity>
                ) : null}
              </View>
            </SheetSection>
          ) : null}

          {/* ── Weather ── */}
          {forecastDays.length > 0 ? (
            <SheetSection title="Weather Forecast">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -18 }}>
                <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 18, paddingBottom: 4 }}>
                  {forecastDays.map((p, i) => {
                    const night = forecastNights[i];
                    return (
                      <View key={i} style={styles.weatherCard}>
                        <Text style={styles.weatherDay}>{p.name.replace('This ', '')}</Text>
                        <Text style={styles.weatherEmoji}>{weatherEmoji(p.shortForecast)}</Text>
                        <Text style={styles.weatherTemp}>{p.temperature}°{p.temperatureUnit}</Text>
                        {night && <Text style={styles.weatherLow}>{night.temperature}° low</Text>}
                        <Text style={styles.weatherDesc} numberOfLines={2}>{p.shortForecast}</Text>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
              {npsWeatherInfo ? (
                <Text style={[styles.sectionBody, { marginTop: 12 }]}>{npsWeatherInfo}</Text>
              ) : null}
            </SheetSection>
          ) : npsWeatherInfo ? (
            <SheetSection title="Weather">
              <Text style={styles.sectionBody}>{npsWeatherInfo}</Text>
            </SheetSection>
          ) : null}

          {/* ── Journal ── */}
          {fullVisits.length > 0 && (
            <SheetSection title={`Your Journal · ${fullVisits.length}`}>
              <View style={{ gap: 8 }}>
                {fullVisits.map(v => {
                  const isExpanded = expandedVisits.has(v.id);
                  return (
                    <View key={v.id} style={styles.visitCard}>
                      <TouchableOpacity
                        onPress={() => setExpandedVisits(prev => {
                          const s = new Set(prev);
                          s.has(v.id) ? s.delete(v.id) : s.add(v.id);
                          return s;
                        })}
                        style={styles.visitCardHeader}
                        activeOpacity={0.7}
                      >
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                            <Text style={styles.visitDate}>{formatDateRange(v.visited_date, v.end_date)}</Text>
                            {v.rating ? <Stars value={v.rating} /> : null}
                          </View>
                          {v.title ? <Text style={styles.visitTitle} numberOfLines={1}>{v.title}</Text> : null}
                        </View>
                        <Ionicons
                          name="chevron-down"
                          size={13}
                          color={C.inkMute}
                          style={{ marginLeft: 8, transform: [{ rotate: isExpanded ? '180deg' : '0deg' }] }}
                        />
                      </TouchableOpacity>

                      {isExpanded && (
                        <View style={styles.visitCardBody}>
                          {v.notes ? (
                            <Text style={styles.visitNotes}>{v.notes}</Text>
                          ) : (
                            <Text style={[styles.visitNotes, { fontStyle: 'italic', color: C.inkMute }]}>No notes</Text>
                          )}
                          {v.photos && v.photos.length > 0 && (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
                              <View style={{ flexDirection: 'row', gap: 6 }}>
                                {v.photos.map((uri, i) => (
                                  <Image
                                    key={i}
                                    source={{ uri }}
                                    style={styles.visitPhoto}
                                    contentFit="cover"
                                    cachePolicy="memory-disk"
                                  />
                                ))}
                              </View>
                            </ScrollView>
                          )}
                          <TouchableOpacity
                            onPress={() => router.push(`/profile/journal/${v.id}` as never)}
                            style={styles.visitEditBtn}
                          >
                            <Ionicons name="pencil-outline" size={11} color={C.primary} />
                            <Text style={[styles.visitEditBtnText, { color: C.primary }]}>Edit entry</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </SheetSection>
          )}

          {/* Attribution */}
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
          </View>{/* end sheetBody */}
        </Animated.ScrollView>

        {/* Collapsing header — image clips from bottom as height shrinks; title stays pinned */}
        <Animated.View style={[styles.collapsingHeader, { height: headerHeight }]} pointerEvents="box-none">
          <LinearGradient
            colors={parkGradient(park.park_code)}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={StyleSheet.absoluteFill} {...topStripPan.panHandlers}>
            {/* Previous image stays visible as background during cross-dissolve */}
            {prevHeroUrl && (
              <Image
                source={{ uri: prevHeroUrl }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            )}
            {heroUrl ? (
              <TouchableOpacity
                style={StyleSheet.absoluteFill}
                activeOpacity={0.95}
                onPress={() => npsImages.length > 0 && setLightboxIdx(imgIdx)}
              >
                <Image
                  key={heroUrl}
                  source={{ uri: heroUrl }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  transition={800}
                  cachePolicy="memory-disk"
                  onLoad={() => { if (!heroLoaded) setHeroLoaded(true); }}
                />
              </TouchableOpacity>
            ) : null}
          </View>
          <LinearGradient
            colors={['rgba(0,0,0,0.45)', 'transparent', 'rgba(0,0,0,0.78)']}
            locations={[0, 0.42, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />
          <View style={styles.sheetTopStrip} {...topStripPan.panHandlers}>
            <View style={styles.handleArea}>
              <View style={styles.handleBar} />
            </View>
          </View>
          <Animated.View
            style={[styles.heroContent, { transform: [{ translateX: heroTitleTranslateX }] }]}
            pointerEvents="none"
          >
            <Animated.Text style={[styles.heroDesignation, { opacity: stateOpacity }]}>
              {stateLabel.toUpperCase()}
            </Animated.Text>
            <Animated.Text
              style={[styles.heroName, { transform: [{ scale: heroTitleScale }], transformOrigin: 'left' }]}
              numberOfLines={titleCollapsed ? 1 : undefined}
            >
              {park.name}
            </Animated.Text>
          </Animated.View>
        </Animated.View>

        {/* Back button — outside ScrollView so it persists after banner scrolls away */}
        {scrollEnabled && (
          <TouchableOpacity
            style={[styles.heroBackBtn, { top: insets.top + 8 }]}
            onPress={dismiss}
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={24} color="#FFFBF1" />
          </TouchableOpacity>
        )}
        </View>{/* end contentPan wrapper */}

        {/* Action row — pinned at bottom, only visible when sheet is full-screen */}
        {scrollEnabled && <View style={[styles.actionRowWrap, { paddingBottom: tabBarH + 8 }]}>
          <View style={styles.actionRow}>
            {park.status === 'visited' ? (
              <>
                <TouchableOpacity
                  onPress={() => router.push({ pathname: '/(modals)/log-visit', params: logVisitParams(park) } as never)}
                  style={[styles.actionBtn, { backgroundColor: C.primary, flex: 1 }]}
                  activeOpacity={0.8}
                >
                  <Ionicons name="pencil" size={14} color={C.onPrimary} />
                  <Text style={styles.actionBtnText}>Log another visit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { if (fullVisits[0]) router.push(`/profile/journal/${fullVisits[0].id}` as never); }}
                  style={[styles.actionBtnOutline, { flex: 1, borderColor: C.primary }]}
                  activeOpacity={0.8}
                >
                  <Ionicons name="pencil-outline" size={14} color={C.primary} />
                  <Text style={[styles.actionBtnOutlineText, { color: C.primary }]}>Edit last visit</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                onPress={() => router.push({ pathname: '/(modals)/log-visit', params: logVisitParams(park) } as never)}
                style={[styles.actionBtn, { backgroundColor: C.primary, flex: 1 }]}
                activeOpacity={0.8}
              >
                <Ionicons name="pencil" size={14} color={C.onPrimary} />
                <Text style={styles.actionBtnText}>Log a visit</Text>
              </TouchableOpacity>
            )}
          </View>
          {park.status !== 'visited' && (
            <TouchableOpacity
              onPress={handleBucketList}
              activeOpacity={0.8}
              style={[styles.bucketBtn, park.status === 'bucketList' && styles.bucketBtnActive]}
            >
              <Ionicons
                name={park.status === 'bucketList' ? 'bookmark' : 'bookmark-outline'}
                size={14}
                color={park.status === 'bucketList' ? C.onPrimary : C.bucket}
              />
              <Text style={[styles.bucketBtnText, park.status === 'bucketList' && { color: C.onPrimary }]}>
                {park.status === 'bucketList' ? 'On bucket list' : 'Add to bucket list'}
              </Text>
            </TouchableOpacity>
          )}
        </View>}
      </Animated.View>

      {lightboxIdx != null && (
        <ImageLightbox
          images={npsImages.map((url, i) => ({ url, title: npsImageTitles[i] ?? null }))}
          initialIndex={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      )}
    </>
  );
}

// ── MapScreen ─────────────────────────────────────────────────────────────────

export default function MapScreen() {
  const { getToken } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { parkCode: focusParkCode } = useLocalSearchParams<{ parkCode?: string }>();

  const [token, setToken]               = useState<string | null>(null);
  const [parks, setParks]               = useState<ParkForMap[]>([]);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [selectedPark, setSelectedPark] = useState<ParkForMap | null>(null);
  const [loading, setLoading]           = useState(true);
  const [mapPressKey, setMapPressKey]   = useState(0);
  const [offlineFetchedAt, setOfflineFetchedAt] = useState<string | null>(null);
  const isOnline = useIsOnline();
  const hasLoadedRef = useRef(false);
  const mapRef = useRef<MapView>(null);
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const controlsBottomAnim = useRef(new Animated.Value(0)).current;
  const rawParksRef = useRef<Array<{
    park_code: string; name: string; states: string;
    latitude: string | null; longitude: string | null;
    description: string | null; image_url: string | null;
  }>>([]);
  const currentRegionRef = useRef({ latitude: 39.0, longitude: -98.5, latitudeDelta: 35, longitudeDelta: 55 });
  const preZoomRegionRef = useRef<typeof currentRegionRef.current | null>(null);

  const counts: Record<FilterStatus, number> = {
    all:        parks.length,
    visited:    parks.filter(p => p.status === 'visited').length,
    bucketList: parks.filter(p => p.status === 'bucketList').length,
    notVisited: parks.filter(p => p.status === 'notVisited').length,
  };

  const filteredParks =
    filterStatus === 'all'        ? parks :
    filterStatus === 'notVisited' ? parks.filter(p => p.status === 'notVisited' || p.status === 'bucketList') :
    parks.filter(p => p.status === filterStatus);

  const mergeVisits = useCallback((
    parksData: typeof rawParksRef.current,
    visitsData: Array<{
      id: number; park_code: string; is_bucket_list: boolean;
      visited_date: string | null; end_date: string | null;
      title: string | null; notes: string | null; photos: string[] | null;
      visibility: string | null;
    }>
  ) => {
    const visitedSet    = new Set<string>();
    const bucketSet     = new Set<string>();
    const visitsPerPark: Record<string, VisitEntry[]> = {};

    for (const v of visitsData) {
      if (v.is_bucket_list) {
        bucketSet.add(v.park_code);
      } else if (v.visited_date) {
        visitedSet.add(v.park_code);
        if (!visitsPerPark[v.park_code]) visitsPerPark[v.park_code] = [];
        visitsPerPark[v.park_code].push({
          id: v.id,
          visited_date: v.visited_date,
          end_date: v.end_date,
          title: v.title,
          notes: v.notes,
        });
      }
    }

    const transformed: ParkForMap[] = parksData
      .filter(p => p.latitude && p.longitude)
      .map(p => {
        let status: ParkStatus = 'notVisited';
        if (visitedSet.has(p.park_code))     status = 'visited';
        else if (bucketSet.has(p.park_code)) status = 'bucketList';
        return {
          park_code:   p.park_code,
          name:        p.name,
          states:      p.states,
          latitude:    parseFloat(p.latitude!),
          longitude:   parseFloat(p.longitude!),
          status,
          description: p.description,
          image_url:   p.image_url,
          visits:      visitsPerPark[p.park_code] ?? [],
        };
      });

    setParks(transformed);
  }, []);

  const loadVisits = useCallback(async () => {
    const tok = await getTokenRef.current();
    if (!tok) return;
    setToken(tok);
    try {
      const visitsData = await apiFetch<Array<{
        id: number; park_code: string; is_bucket_list: boolean;
        visited_date: string | null; end_date: string | null;
        title: string | null; notes: string | null; photos: string[] | null;
        visibility: string | null;
      }>>('/api/visits', tok);
      mergeVisits(rawParksRef.current, visitsData);
    } catch (e) {
      console.error('Map visits load failed:', e);
    }
  }, [mergeVisits]);

  const loadData = useCallback(async () => {
    const tok = await getTokenRef.current();
    if (!tok) return;
    setToken(tok);
    const isFirstLoad = !hasLoadedRef.current;
    if (isFirstLoad) setLoading(true);

    let parksData: typeof rawParksRef.current | null = null;
    // Paint whatever's already downloaded instantly instead of blocking on the
    // network — the live fetch below still runs and replaces it once it lands.
    let cache = isFirstLoad ? await loadOfflineParks() : null;
    if (cache) {
      parksData = cache.parks;
      rawParksRef.current = cache.parks;
      mergeVisits(cache.parks, []);
      setOfflineFetchedAt(isOnline ? null : cache.fetchedAt);
      setLoading(false);
      hasLoadedRef.current = true;
    }

    if (!isOnline) {
      if (!hasLoadedRef.current) {
        cache ??= await loadOfflineParks();
        if (!cache) { setLoading(false); return; }
        parksData = cache.parks;
        setOfflineFetchedAt(cache.fetchedAt);
        hasLoadedRef.current = true;
      }
    } else {
      try {
        parksData = await apiFetch<Array<{
          park_code: string; name: string; states: string;
          latitude: string | null; longitude: string | null;
          description: string | null; image_url: string | null;
        }>>('/api/parks', tok);
        setOfflineFetchedAt(null);
        hasLoadedRef.current = true;
        saveOfflineParks(parksData); // silent background refresh of the offline cache
      } catch (e) {
        console.error('Map parks load failed, falling back to offline cache:', e);
        cache ??= await loadOfflineParks();
        if (cache) {
          parksData = cache.parks;
          setOfflineFetchedAt(cache.fetchedAt);
          hasLoadedRef.current = true;
        } else if (!hasLoadedRef.current) {
          setLoading(false);
          return;
        }
      }
    }
    if (!parksData) { setLoading(false); return; }
    rawParksRef.current = parksData;
    try {
      const visitsData = await apiFetch<Array<{
        id: number; park_code: string; is_bucket_list: boolean;
        visited_date: string | null; end_date: string | null;
        title: string | null; notes: string | null; photos: string[] | null;
        visibility: string | null;
      }>>('/api/visits', tok);
      mergeVisits(parksData, visitsData);
    } catch (e) {
      console.error('Map visits load failed:', e);
      mergeVisits(parksData, []);
    } finally {
      setLoading(false);
    }
  }, [mergeVisits, isOnline]);

  // Parks are static — load once on mount. Visits change — reload on every focus.
  useEffect(() => { loadData(); }, [loadData]);

  const loadVisitsRef = useRef(loadVisits);
  loadVisitsRef.current = loadVisits;
  useFocusEffect(useCallback(() => { loadVisitsRef.current(); }, []));

  // Animate map controls away from sheet edge when sheet opens/closes
  useEffect(() => {
    Animated.timing(controlsBottomAnim, {
      toValue: selectedPark ? SHEET_PEEK + 14 : insets.bottom + 68,
      duration: 220,
      useNativeDriver: false,
    }).start();
  }, [selectedPark, insets.bottom]);

  const handleSheetDismissStart = useCallback(() => {
    Animated.timing(controlsBottomAnim, {
      toValue: insets.bottom + 68,
      duration: 220,
      useNativeDriver: false,
    }).start();
  }, [insets.bottom]);

  const handleStatusChange = useCallback((code: string, status: ParkStatus) => {
    setParks(prev =>
      prev.map(p => p.park_code === code ? { ...p, status } : p)
    );
  }, []);

  // The bottom sheet is opened with a snapshot of the tapped park. Re-derive it from
  // the live `parks` list on every render instead, so a status change picked up by
  // loadVisits() (e.g. after logging a visit) or handleStatusChange (bucket-list
  // toggle) is reflected in the open sheet instantly, without closing/reopening it.
  const liveSelectedPark = selectedPark
    ? parks.find(p => p.park_code === selectedPark.park_code) ?? selectedPark
    : null;

  const handleSelectPark = useCallback((park: ParkForMap) => {
    setSelectedPark(park);
    preZoomRegionRef.current = currentRegionRef.current;
    const LAT_DELTA = 1.5;
    // Offset center southward so pin appears at vertical center of visible area (above sheet)
    const latOffset = (SHEET_PEEK * LAT_DELTA) / (2 * SCREEN_H);
    mapRef.current?.animateToRegion(
      {
        latitude:       park.latitude - latOffset,
        longitude:      park.longitude,
        latitudeDelta:  LAT_DELTA,
        longitudeDelta: 1.5,
      },
      500
    );
  }, []);

  useEffect(() => {
    if (!focusParkCode || parks.length === 0) return;
    const park = parks.find(p => p.park_code === focusParkCode);
    if (park) handleSelectPark(park);
  }, [focusParkCode, parks, handleSelectPark]);

  const zoomIn = useCallback(() => {
    const r = currentRegionRef.current;
    mapRef.current?.animateToRegion(
      { ...r, latitudeDelta: Math.max(r.latitudeDelta / 2, 0.005), longitudeDelta: Math.max(r.longitudeDelta / 2, 0.005) },
      300
    );
  }, []);

  const zoomOut = useCallback(() => {
    const r = currentRegionRef.current;
    mapRef.current?.animateToRegion(
      { ...r, latitudeDelta: Math.min(r.latitudeDelta * 2, 120), longitudeDelta: Math.min(r.longitudeDelta * 2, 120) },
      300
    );
  }, []);

  const goHome = useCallback(() => {
    mapRef.current?.animateToRegion(
      { latitude: 39.0, longitude: -98.5, latitudeDelta: 35, longitudeDelta: 55 },
      500
    );
  }, []);

  // Restore the map to its pre-selection view once the sheet closes.
  useEffect(() => {
    if (selectedPark === null && preZoomRegionRef.current) {
      mapRef.current?.animateToRegion(preZoomRegionRef.current, 500);
      preZoomRegionRef.current = null;
    }
  }, [selectedPark]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('mapTabPress', () => {
      setSelectedPark(null);
      setFilterStatus('all');
      preZoomRegionRef.current = null; // goHome supersedes the restore-on-close animation
      goHome();
    });
    return () => sub.remove();
  }, [goHome]);

  return (
    <View style={styles.screen}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_DEFAULT}
        mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
        initialRegion={{
          latitude:       39.0,
          longitude:      -98.5,
          latitudeDelta:  35,
          longitudeDelta: 55,
        }}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        onRegionChangeComplete={region => { currentRegionRef.current = region; }}
        onPress={() => { setSelectedPark(null); setMapPressKey(k => k + 1); }}
      >
        {filteredParks.map(park => (
          <ParkMapMarker
            key={park.park_code}
            park={park}
            selected={selectedPark?.park_code === park.park_code}
            onSelect={handleSelectPark}
          />
        ))}
      </MapView>

      {offlineFetchedAt && (
        <View style={{ position: 'absolute', top: insets.top + 8, left: 0, right: 0 }}>
          <OfflineBanner fetchedAt={offlineFetchedAt} />
        </View>
      )}

      <View style={[styles.filterPillWrap, { top: insets.top + (offlineFetchedAt ? 96 : 60) }]}>
        <FilterPill
          active={filterStatus}
          counts={counts}
          onSelect={f => { setFilterStatus(f); setSelectedPark(null); }}
        />
      </View>

      {loading && (
        <View style={styles.mapLoadingOverlay} pointerEvents="none">
          <CompassSpinner size={36} dark />
        </View>
      )}

      {liveSelectedPark && token && (
        <ParkBottomSheet
          key={liveSelectedPark.park_code}
          park={liveSelectedPark}
          token={token}
          onClose={() => setSelectedPark(null)}
          onDismissStart={handleSheetDismissStart}
          onStatusChange={handleStatusChange}
        />
      )}

      {/* Map controls */}
      <Animated.View style={[styles.mapControls, { bottom: controlsBottomAnim }]}>
        <TouchableOpacity style={styles.mapControlBtn} onPress={zoomIn} activeOpacity={0.75}>
          <Ionicons name="add" size={18} color="#4A4535" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.mapControlBtn} onPress={zoomOut} activeOpacity={0.75}>
          <Ionicons name="remove" size={18} color="#4A4535" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.mapControlBtn} onPress={goHome} activeOpacity={0.75}>
          <Ionicons name="home-outline" size={14} color="#4A4535" />
        </TouchableOpacity>
      </Animated.View>

      {/* Search — rendered last so results overlay everything (like the park sheet),
          but drops behind the sheet while a park profile is open */}
      <View style={[
        styles.searchBarWrap,
        { top: insets.top + 12 },
        selectedPark ? { zIndex: 10, elevation: 0 } : null,
      ]}>
        <MapSearchBar
          token={token}
          parks={parks}
          closeSignal={mapPressKey}
          onSelectPark={handleSelectPark}
          onSelectUser={id => router.push(`/user/${id}` as never)}
        />
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#CECDBC',
  },

  // Search bar
  searchBarWrap: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 40,
    elevation: 10,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: dyn('rgba(255,251,241,0.95)', 'rgba(32,29,23,0.95)'),
    borderWidth: 0.5,
    borderColor: C.hairline,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: C.ink,
    padding: 0,
  },
  searchResults: {
    marginTop: 6,
    backgroundColor: C.surface,
    borderWidth: 0.5,
    borderColor: C.hairline,
    borderRadius: 14,
    paddingBottom: 6,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  searchSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: C.inkMute,
    letterSpacing: 0.8,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 2,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  searchRowIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: C.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchRowAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  searchRowTitle: {
    fontSize: 13.5,
    fontWeight: '600',
    color: C.ink,
  },
  searchRowSub: {
    fontSize: 13,
    color: C.inkMute,
    marginTop: 1,
  },

  // Filter pill
  filterPillWrap: {
    position: 'absolute',
    left: 14,
    right: 14,
    alignItems: 'stretch',
    zIndex: 20,
  },
  mapControls: {
    position: 'absolute',
    right: 14,
    zIndex: 20,
    flexDirection: 'column',
    gap: 4,
  },
  mapControlBtn: {
    width: 36,
    height: 36,
    borderRadius: 9,
    backgroundColor: dyn('rgba(255,251,241,0.93)', 'rgba(32,29,23,0.93)'),
    borderWidth: 0.5,
    borderColor: C.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingWrap: {
    position: 'absolute',
    left: 14,
    zIndex: 20,
  },
  mapLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  mapLoadingCard: {
    backgroundColor: dyn('rgba(255,251,241,0.92)', 'rgba(32,29,23,0.92)'),
    borderRadius: 24,
    borderWidth: 0.5,
    borderColor: C.hairline,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 12,
    elevation: 6,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '100%',
    backgroundColor: dyn('rgba(255,251,241,0.92)', 'rgba(32,29,23,0.92)'),
    borderWidth: 0.5,
    borderColor: C.hairline,
    borderRadius: 100,
    paddingVertical: 6,
    paddingHorizontal: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  pillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    minWidth: 0,
    borderRadius: 100,
    paddingHorizontal: 3,
    paddingVertical: 4,
    gap: 2,
  },
  pillBtnFlex: {
    flex: 1,
    justifyContent: 'center',
  },
  pillBtnActive: {
    backgroundColor: 'rgba(31,61,46,0.10)',
  },
  pillDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  pillCount: {
    fontSize: 13,
    fontWeight: '700',
    color: C.ink,
    minWidth: 12,
    textAlign: 'center',
  },
  pillCountActive: {
    color: C.ink,
  },
  pillLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: C.inkSoft,
    letterSpacing: 0.2,
    flexShrink: 0,
  },
  pillLabelActive: {
    color: C.ink,
  },
  pillDivider: {
    width: 1,
    height: 12,
    backgroundColor: C.hairline,
    marginHorizontal: 4,
  },

  // Bottom sheet
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 29,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    backgroundColor: dyn('rgba(255,251,241,0.97)', 'rgba(32,29,23,0.97)'),
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 0.5,
    borderColor: C.hairline,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 16,
    overflow: 'hidden',
  },
  // Drag handle + close — overlaid on banner image
  sheetTopStrip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
    paddingHorizontal: 10,
    zIndex: 5,
  },
  handleArea: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,251,241,0.65)',
  },
  heroClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(20,17,12,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBackBtn: {
    position: 'absolute',
    left: 16,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Collapsing header — absolute, overlays scroll; height drives the collapse
  collapsingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
    zIndex: 5,
  },
  heroContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
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
    color: C.onPrimary,
    letterSpacing: -0.5,
    lineHeight: 32,
  },
  // Sticky title bar — compact single-line name when scrolled
  titleBar: {
    backgroundColor: C.surface,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: C.hairline,
  },
  titleBarState: {
    fontSize: 13,
    fontWeight: '700',
    color: C.inkMute,
    letterSpacing: 1.4,
    marginBottom: 2,
  },
  titleBarName: {
    fontSize: 16,
    fontWeight: '800',
    color: C.ink,
    letterSpacing: -0.2,
  },

  // Scrollable body
  sheetBody: {
    paddingBottom: 8,
  },

  // Photo strip
  photoStrip: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    gap: 8,
    flexDirection: 'row',
  },
  photoStripItem: {
    width: 110,
    height: 72,
    borderRadius: 10,
    overflow: 'hidden',
  },

  // Quick stats
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: C.hairline,
    overflow: 'hidden',
    marginTop: 14,
    marginBottom: 14,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
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
    marginTop: 12,
    backgroundColor: C.surface,
    borderRadius: 14,
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

  sectionBody: {
    fontSize: 13.5,
    color: C.inkSoft,
    lineHeight: 20,
  },

  // Full profile sections
  profileSection: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderTopWidth: 0.5,
    borderTopColor: C.hairlineSoft,
  },
  profileSectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: C.ink,
    letterSpacing: -0.2,
    marginBottom: 12,
  },

  // Chips
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  activityChip: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 100,
    borderWidth: 0.5,
    borderColor: C.hairline,
    backgroundColor: C.surfaceAlt,
  },
  activityChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: C.inkSoft,
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
    paddingVertical: 4,
  },
  hoursDay: {
    fontSize: 13,
    fontWeight: '500',
    color: C.inkSoft,
  },
  hoursVal: {
    fontSize: 13,
    color: C.inkMute,
  },

  // Fees
  feeCard: {
    backgroundColor: C.surface,
    borderRadius: 10,
    padding: 11,
    borderWidth: 0.5,
    borderColor: C.hairline,
  },
  feeName: {
    fontSize: 13,
    fontWeight: '700',
    color: C.ink,
    flex: 1,
    marginRight: 8,
  },
  feeCost: {
    fontSize: 13,
    fontWeight: '700',
  },
  feeDesc: {
    fontSize: 13,
    color: C.inkMute,
    lineHeight: 15,
  },

  // Links / contact
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
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
    borderRadius: 11,
    borderWidth: 0.5,
    borderColor: C.hairline,
    padding: 11,
    width: 88,
    alignItems: 'center',
  },
  weatherDay: {
    fontSize: 13,
    fontWeight: '700',
    color: C.inkMute,
    letterSpacing: 0.2,
    marginBottom: 5,
    textAlign: 'center',
  },
  weatherEmoji: {
    fontSize: 22,
    marginBottom: 3,
  },
  weatherTemp: {
    fontSize: 15,
    fontWeight: '800',
    color: C.ink,
  },
  weatherLow: {
    fontSize: 13,
    color: C.inkMute,
    marginTop: 1,
    marginBottom: 4,
  },
  weatherDesc: {
    fontSize: 13,
    color: C.inkMute,
    textAlign: 'center',
    lineHeight: 17,
    marginTop: 3,
  },

  // Journal / visit cards
  visitCard: {
    backgroundColor: C.surface,
    borderWidth: 0.5,
    borderColor: C.hairline,
    borderRadius: 10,
    overflow: 'hidden',
  },
  visitCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 11,
    gap: 6,
  },
  visitCardBody: {
    padding: 11,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: C.hairlineSoft,
    backgroundColor: C.surfaceAlt,
  },
  visitDate: {
    fontSize: 13,
    fontWeight: '600',
    color: C.ink,
  },
  visitTitle: {
    fontSize: 13,
    color: C.inkSoft,
    marginTop: 1,
  },
  visitNotes: {
    fontSize: 13,
    color: C.inkSoft,
    lineHeight: 18,
  },
  visitPhoto: {
    width: 70,
    height: 56,
    borderRadius: 7,
  },
  visitEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 10,
  },
  visitEditBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Attribution
  attribution: {
    marginHorizontal: 18,
    paddingVertical: 16,
    borderTopWidth: 0.5,
    borderTopColor: C.hairlineSoft,
    marginTop: 4,
  },
  attributionText: {
    fontSize: 13,
    color: C.inkMute,
    lineHeight: 14,
    textAlign: 'center',
  },
  attributionLink: {
    textDecorationLine: 'underline',
  },

  // Action row — bottom padding (inline) clears the floating tab bar
  actionRowWrap: {
    flexShrink: 0,
    borderTopWidth: 0.5,
    borderTopColor: C.hairlineSoft,
    paddingTop: 12,
    paddingHorizontal: 14,
    gap: 10,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: C.onPrimary,
  },
  actionBtnOutline: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    backgroundColor: 'transparent',
  },
  actionBtnOutlineText: {
    fontSize: 13,
    fontWeight: '700',
  },
  bucketBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: C.bucket,
  },
  bucketBtnActive: {
    backgroundColor: C.bucket,
    borderColor: C.bucket,
  },
  bucketBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: C.bucket,
  },
});
