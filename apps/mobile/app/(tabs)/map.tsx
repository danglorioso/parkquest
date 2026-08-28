import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, DeviceEventEmitter, Dimensions, Keyboard, Platform,
  Pressable, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View, useColorScheme,
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
import { STATIC as C, dyn } from '@/lib/palette';
import { CompassSpinner } from '@/components/LoadingScreen';
import { loadOfflineParks, saveOfflineParks } from '@/lib/offlineParks';
import { OfflineBanner } from '@/components/OfflineBanner';
import { useIsOnline } from '@/lib/network';
import { PARK_TYPES } from '@/lib/parkTypes';
import { getDefaultParkTypes } from '@/lib/settings';
import { MapDetailsSheet, type StatusOption } from '@/components/MapDetailsSheet';
import { ParkProfileScreen } from '../park/[id]';

// Not-yet-visited marker gray — map-only, not part of the shared palette
const UNVISITED = '#A8A29A';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');

// ── Park label declutter ────────────────────────────────────────────────────────
// Below LABEL_ZOOM_GATE, labels aren't gated by zoom at all — parks are unevenly
// spread (a tight Utah/California cluster vs. a lone Hawai'i or American Samoa
// pin), so a flat cutoff either clutters the clusters or hides isolated parks
// that had room to show all along. Instead, on every region change we project
// each park to approximate screen pixels and greedily keep a park's label only
// if its reserved rectangle doesn't overlap another park's dot or an
// already-placed label.

// The default whole-US view (both coasts on screen) shows no labels — that
// resting state reads as dots-only; the slightest zoom past home hands off to
// the declutter pass above. The home region is REQUESTED as lat/lon deltas
// 35/55, but Apple Maps normalizes to the screen's aspect ratio and reports
// latitudeDelta ≈ 55 · (screenH/screenW) (~119 on a tall iPhone) — so the
// gate is derived from that normalized value, not the requested 35, or one
// whole zoom notch (halving to ~60) would still read as "at home".
const LABEL_ZOOM_GATE = Math.max(35, 55 * (SCREEN_H / SCREEN_W)) * 0.98;
// Horizontal gap (px) between a dot's coordinate and where its label pill starts.
// Clears the unselected halo (max radius 13); a selected dot's larger halo (17)
// tucks slightly under the pill's rounded corner, which reads fine since only
// one marker is ever selected at a time.
const LABEL_GAP = 12;
// Reserved space to the left of the dot's coordinate, covering the halo so a
// neighboring label can't be placed on top of this dot.
const DOT_RESERVE = 18;
// Reserved vertical space per label — generous enough to clear a selected dot's
// halo (34px tall) above/below.
const LABEL_RECT_H = 34;
// Pill's own horizontal padding (7 left + 7 right, see mapLabelPill style).
const LABEL_PILL_PAD = 14;
const LABEL_PILL_MAX_TEXT_W = 150 - LABEL_PILL_PAD;
// Rough average glyph width for the 11.5pt bold label font — doesn't need to be
// pixel-exact, only good enough for a collision heuristic and a width the pill can
// be pre-sized to (see ParkLabelMarker — a *known* width, not just a shrink-to-fit
// one, is what lets iOS's centerOffset placement land correctly without an
// onLayout measure-then-reposition round trip).
const LABEL_CHAR_W = 7;

// User-adjustable label size (labels menu next to the filter chip). The
// declutter estimate scales its glyph width by fontSize/11.5 so bigger text
// reserves proportionally more room. Snapped to 0.5pt steps so a drag doesn't
// re-measure every marker on every frame.
const LABEL_FONT_MIN = 9;
const LABEL_FONT_MAX = 15;
const LABEL_FONT_DEFAULT = 11.5;

// Pill's own rendered width (excludes the gap to the dot) — shared by the
// collision estimate below and by ParkLabelMarker's actual layout, so the two
// stay in lockstep.
function pillContentWidth(name: string, fontScale: number): number {
  const textW = Math.min(shortParkName(name).length * LABEL_CHAR_W * fontScale, LABEL_PILL_MAX_TEXT_W * fontScale);
  return textW + LABEL_PILL_PAD;
}

function estimateLabelRectWidth(name: string, fontScale: number): number {
  return DOT_RESERVE + LABEL_GAP + pillContentWidth(name, fontScale);
}

interface LabelRect { x: number; y: number; w: number; h: number }

function rectsOverlap(a: LabelRect, b: LabelRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

type MapRegion = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };

// Greedy label declutter. Projects lat/lng to approximate screen pixels using the
// region's own deltas — react-native-maps already normalizes those to the screen's
// aspect ratio, so no separate latitude/Mercator correction is needed for a
// show/hide heuristic like this. `parks` order determines priority on ties.
//
// Layered on top of that is a flat gate: at the default whole-US view
// (latitudeDelta 35), no label shows even if it'd technically clear the
// collision test — that view is the map's resting state and should read as
// dots-only. A small zoom in past LABEL_ZOOM_GATE lifts the gate and lets the
// declutter pass take over.
function computeVisibleLabelCodes(
  parks: ParkForMap[], region: MapRegion, fontScale: number,
  // Labels visible in the previous pass get first claim on space — so a text
  // resize (or pan/zoom nudge) never hides a label that still fits just
  // because a different park happened to come earlier in array order.
  sticky?: Set<string>,
): Set<string> {
  if (region.latitudeDelta <= 0 || region.longitudeDelta <= 0) return new Set();
  if (region.latitudeDelta >= LABEL_ZOOM_GATE) return new Set();
  const pxPerDegLat = SCREEN_H / region.latitudeDelta;
  const pxPerDegLon = SCREEN_W / region.longitudeDelta;

  const ordered = sticky?.size
    ? [...parks.filter(p => sticky.has(p.park_code)), ...parks.filter(p => !sticky.has(p.park_code))]
    : parks;
  const points = ordered.map(p => ({
    park: p,
    x: (p.longitude - region.longitude) * pxPerDegLon,
    y: (region.latitude - p.latitude) * pxPerDegLat,
  }));

  const placed: LabelRect[] = [];
  const visible = new Set<string>();

  for (const pt of points) {
    const rect: LabelRect = {
      x: pt.x - DOT_RESERVE,
      y: pt.y - LABEL_RECT_H / 2,
      w: estimateLabelRectWidth(pt.park.name, fontScale),
      h: LABEL_RECT_H,
    };

    const dotCollision = points.some(other =>
      other.park.park_code !== pt.park.park_code &&
      other.x >= rect.x && other.x <= rect.x + rect.w &&
      other.y >= rect.y && other.y <= rect.y + rect.h
    );
    const labelCollision = !dotCollision && placed.some(pr => rectsOverlap(rect, pr));

    if (!dotCollision && !labelCollision) {
      placed.push(rect);
      visible.add(pt.park.park_code);
    }
  }

  return visible;
}

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
  is_national_park: boolean;
  designation: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// The map already has every park loaded — passes it straight through as
// ParkProfileScreen's seed props so the sheet paints the hero instantly
// instead of opening on a blank spinner while it fetches nps/weather/visits
// itself. Mirrors logVisitParams' pattern elsewhere in the app. Props, not
// route params, now that the sheet is rendered inline rather than
// presented as its own screen — see the comment above ParkDetailRoute in
// park/[id].tsx for why that changed.
function parkSheetProps(park: ParkForMap) {
  return {
    id: park.park_code, seedName: park.name, seedStates: park.states,
    seedDescription: park.description ?? '',
    seedLatitude: String(park.latitude), seedLongitude: String(park.longitude),
    seedImageUrl: park.image_url ?? '',
    // The map already knows visited/bucket-list status (it's what colors
    // the dot) — seeding it lets the header buttons paint their final
    // "Log another visit" / "Edit last visit" set immediately instead of
    // opening as "Log a visit" and popping once the sheet's own /api/visits
    // fetch lands.
    seedStatus: park.status,
  };
}

// Blends a hex color toward white — used to pastel-ify a national-park
// dot's fill so the dark center star (see ParkMarker) has enough contrast
// to read, without giving up the status hue entirely like a flat neutral
// fill would.
function lighten(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (channel: number) => Math.round(channel + (255 - channel) * amt);
  const r = mix((n >> 16) & 255), g = mix((n >> 8) & 255), b = mix(n & 255);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

// Concrete hex strings only — markers render into static bitmaps
// (tracksViewChanges={false}), and a DynamicColorIOS resolves at whatever
// theme was active when each marker happened to be snapshotted, leaving a
// mix of light- and dark-resolved borders after a theme change.
// Every dot is the same size/opacity regardless of type — shrinking the
// non-national ones made them too small to reliably see or tap. The
// "special" signal for national parks is entirely the star badge riding
// the dot's corner (see ParkMarker) now, not size or color.
function markerConfig(status: ParkStatus, selected: boolean, dark: boolean, isNationalPark: boolean) {
  const color =
    status === 'visited'    ? (dark ? '#4FA76C' : '#2F7A4A') :
    status === 'bucketList' ? (dark ? '#D9A63E' : '#C48A20') : UNVISITED;
  const border = dark ? '#201D17' : '#FFFBF1';
  const dotR  = selected ? 11 : status === 'visited' ? 8 : 6.5;
  const haloR = selected ? 18 : status === 'visited' ? 14 : 11;
  const haloOpacity = selected ? 0.24 : 0.16;
  const dotOpacity = 1;
  const borderWidth = 2.5;
  return { color, border, dotR, haloR, haloOpacity, dotOpacity, borderWidth };
}

// Strips the designation suffix for map labels, where space is tight —
// "Grand Canyon National Park" → "Grand Canyon", "Coltsville National
// Historical Park" → "Coltsville". Handles the "X National Park & Preserve" /
// "National and State Parks" variants and the one park named "National Park
// of American Samoa" (designation is a prefix, not a suffix).
function shortParkName(name: string): string {
  return name
    .replace(/^National Park of /i, '')
    .replace(/ National (?:Historical )?(?:and State )?Parks?(?: (?:&|and) Preserve)?$/i, '')
    .trim();
}

// ── ParkMarker ────────────────────────────────────────────────────────────────

function ParkMarker({ park, selected }: { park: ParkForMap; selected: boolean }) {
  // Android is pinned to the light theme app-wide (see palette.tsx), so only
  // iOS ever resolves dark marker colors.
  const dark = useColorScheme() === 'dark' && Platform.OS === 'ios';
  const { color, border, dotR, haloR, haloOpacity, dotOpacity, borderWidth } =
    markerConfig(park.status, selected, dark, park.is_national_park);
  // Outer box is ALWAYS sized for the selected (largest) halo, never the
  // actual current haloR — when the marker's own declared size changes in
  // the same tick tracksViewChanges goes live (both happen together on
  // select/deselect, see ParkMapMarker), MapKit briefly re-anchors the
  // resized native view at its (0,0) corner instead of re-centering it on
  // the geo coordinate, reading as the dot jumping to the top-left of the
  // map for a frame. A fixed outer box means selecting only changes what's
  // drawn INSIDE a view whose own size never moves, so there's nothing for
  // MapKit to re-anchor.
  const maxSz = markerConfig(park.status, true, dark, park.is_national_park).haloR * 2;
  return (
    <View style={{ width: maxSz, height: maxSz, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{
        position: 'absolute',
        width: haloR * 2, height: haloR * 2, borderRadius: haloR,
        backgroundColor: color, opacity: haloOpacity,
      }} />
      <View style={{ width: dotR * 2, height: dotR * 2, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{
          width: dotR * 2, height: dotR * 2, borderRadius: dotR,
          backgroundColor: park.is_national_park ? lighten(color, 0.55) : color,
          opacity: dotOpacity,
          borderWidth,
          borderColor: border,
        }} />
        {park.is_national_park && (
          // Stamped in the center of the dot itself, not a corner badge.
          // Fixed dark fill (not `border`, which flips to near-white in
          // light mode) — reads more clearly against the status colors
          // than white did, and stays constant across themes.
          <Ionicons name="star" size={dotR * 1.15} color="#1B1A16" style={{ position: 'absolute' }} />
        )}
      </View>
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
  // Theme is part of the snapshot key too — marker colors are resolved per
  // scheme (see markerConfig), so a light/dark flip needs a re-snapshot just
  // like a status flip. `selected` is in the key for the same reason: without
  // it, deselecting (tracksViewChanges true -> false on the same render, no
  // settle beat) could snapshot before Apple Maps had actually redrawn the
  // smaller/unselected halo, leaving the dot blank until some unrelated
  // region change forced every marker to redraw.
  const scheme = useColorScheme();
  const snapshotKey = `${park.status}:${scheme}:${selected}`;
  const prevKey = useRef(snapshotKey);
  const [justChanged, setJustChanged] = useState(false);

  useEffect(() => {
    if (prevKey.current === snapshotKey) return;
    prevKey.current = snapshotKey;
    setJustChanged(true);
    const t = setTimeout(() => setJustChanged(false), 300);
    return () => clearTimeout(t);
  }, [snapshotKey]);

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

// Floating name label, anchored at the same coordinate as its dot but shifted
// right so the dot stays uncovered. Only mounted for parks the declutter pass
// (computeVisibleLabelCodes) keeps clear of overlap. Tapping the label opens
// the same sheet as tapping the dot.
//
// Placement is platform-split because react-native-maps' custom marker-view
// anchoring works differently per backend: `anchor` (a 0–1 fraction of the
// view) is only wired up for Google Maps, which is what Android always uses
// here — but this app's iOS provider is Apple Maps (PROVIDER_DEFAULT), where
// `anchor` is silently ignored and the view is always center-anchored on the
// coordinate instead. Apple Maps only exposes `centerOffset`, a raw-pixel shift
// applied on top of that center anchor — so on iOS we shift right by half the
// view's own width to land its left edge on the coordinate, matching what
// `anchor={{x:0}}` already gives Android.
//
// The pill hugs its text exactly (no fixed/estimated width — the declutter
// pass's width estimate is only for the show/hide decision, not the render),
// so the real width isn't known until the first layout pass. tracksViewChanges
// stays on through that first pass — invisible until measured, so the wrong
// (default centered) snapshot is never seen — then settles false once the
// measured width has been applied for one more frame, same re-snapshot pattern
// ParkMapMarker uses for a status/theme flip.
function ParkLabelMarker({
  park, onSelect, fontSize,
}: { park: ParkForMap; onSelect: (park: ParkForMap) => void; fontSize: number }) {
  const [pillW, setPillW] = useState<number | null>(null);
  const [tracking, setTracking] = useState(true);

  useEffect(() => {
    if (pillW === null) return;
    const t = setTimeout(() => setTracking(false), 50);
    return () => clearTimeout(t);
  }, [pillW]);


  const totalW = LABEL_GAP + (pillW ?? 0);

  return (
    <Marker
      coordinate={{ latitude: park.latitude, longitude: park.longitude }}
      onPress={e => { e.stopPropagation(); onSelect(park); }}
      anchor={{ x: 0, y: 0.5 }}
      centerOffset={{ x: totalW / 2, y: 0 }}
      tracksViewChanges={tracking}
      zIndex={5}
    >
      <View style={[styles.mapLabelRow, pillW === null && { opacity: 0 }]}>
        <View style={{ width: LABEL_GAP }} />
        <View
          style={[
            styles.mapLabelPill,
            // Historical park labels stay smaller/lighter — same hierarchy
            // as their dots, so National Parks read as primary content.
            !park.is_national_park && { paddingHorizontal: 5, paddingVertical: 2, opacity: 0.75 },
          ]}
          onLayout={e => {
            const w = Math.ceil(e.nativeEvent.layout.width);
            setPillW(prev => (prev === w ? prev : w));
          }}
        >
          <Text
            style={[
              styles.mapLabelText,
              { fontSize: park.is_national_park ? fontSize : fontSize - 1.5 },
              !park.is_national_park && { fontWeight: '600' },
            ]}
            numberOfLines={1}
          >
            {shortParkName(park.name)}
          </Text>
        </View>
      </View>
    </Marker>
  );
}

const FILTERS: Array<{ key: FilterStatus; dot: ColorValue; label: string }> = [
  { key: 'all',        dot: C.ink,       label: 'ALL'    },
  { key: 'visited',    dot: C.visited,   label: 'VISITED'},
  { key: 'bucketList', dot: C.bucket,    label: 'BUCKET' },
  { key: 'notVisited', dot: UNVISITED, label: 'TO GO'  },
];

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
          placeholder="Parks, states, or users…"
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

// ── MapScreen ─────────────────────────────────────────────────────────────────

export default function MapScreen() {
  const { getToken } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { parkCode: focusParkCode, filter: focusFilter, zoomClose: focusZoomClose } = useLocalSearchParams<{ parkCode?: string; filter?: FilterStatus; zoomClose?: string }>();

  const [token, setToken]               = useState<string | null>(null);
  const [parks, setParks]               = useState<ParkForMap[]>([]);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [selectedPark, setSelectedPark] = useState<ParkForMap | null>(null);
  const [loading, setLoading]           = useState(true);
  // Kept mounted a beat past `loading` going false so the compass spinner can
  // fade out instead of popping off instantly.
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(true);
  const loadingOpacity = useRef(new Animated.Value(1)).current;
  const [mapPressKey, setMapPressKey]   = useState(0);
  const [offlineFetchedAt, setOfflineFetchedAt] = useState<string | null>(null);
  const isOnline = useIsOnline();
  const hasLoadedRef = useRef(false);
  const mapRef = useRef<MapView>(null);
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  // Last ?parkCode= deep-link value already presented (see the effect below).
  const focusHandledRef = useRef<string | null>(null);
  const rawParksRef = useRef<Array<{
    park_code: string; name: string; states: string;
    latitude: string | null; longitude: string | null;
    description: string | null; image_url: string | null;
    is_national_park?: boolean; designation?: string | null;
  }>>([]);
  const currentRegionRef = useRef({ latitude: 39.0, longitude: -98.5, latitudeDelta: 35, longitudeDelta: 55 });
  // Drives the label declutter recompute below — kept separate from
  // currentRegionRef (read synchronously by zoomIn/zoomOut/goHome without waiting
  // on a re-render) since this one exists purely to trigger the useMemo.
  const [labelRegion, setLabelRegion] = useState(currentRegionRef.current);
  const [labelsEnabled, setLabelsEnabled] = useState(true);
  const [labelFontSize, setLabelFontSize] = useState(LABEL_FONT_DEFAULT);
  // One consolidated "Map Details" sheet (status + park types + labels)
  // instead of three separate floating pills — see MapDetailsSheet.
  const [mapDetailsOpen, setMapDetailsOpen] = useState(false);
  const isDarkScheme = useColorScheme() === 'dark';
  // Starts as every type shown (matches the all-parks list's own default)
  // then swaps to whatever the user's set in Profile → Appearance, once
  // that async read resolves — see lib/settings' getDefaultParkTypes.
  const [enabledParkTypes, setEnabledParkTypes] = useState<Set<string>>(() => new Set(PARK_TYPES.map(t => t.key)));
  useEffect(() => { getDefaultParkTypes().then(keys => setEnabledParkTypes(new Set(keys))); }, []);
  // Last declutter result — fed back in as the sticky set so still-fitting
  // labels survive font-size changes and region nudges.
  const prevVisibleLabelsRef = useRef<Set<string>>(new Set());

  // Pins + status-filter counts respect the park-type filter; search
  // deliberately doesn't — you can still find and log a visit to any park
  // regardless of what the map is currently showing.
  const visibleParks = parks.filter(p => PARK_TYPES.some(t => enabledParkTypes.has(t.key) && t.match(p)));
  const parkTypeCounts: Record<string, number> = Object.fromEntries(
    PARK_TYPES.map(t => [t.key, parks.filter(t.match).length])
  );

  // Shared by the Map Details sheet's checklist and the quick-access chip
  // row below the search bar. Every chip's highlight is independent — tap
  // always just flips that one, regardless of whether "All" happens to be
  // active — no special-cased narrowing, which was the same gesture doing
  // two different things depending on invisible prior state.
  const toggleParkType = useCallback((key: string) => {
    setEnabledParkTypes(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
    setSelectedPark(null);
  }, []);

  // Tapping "All" while it's already active turns everything off, same as
  // tapping an active individual chip removes just that one — "All" behaves
  // like any other selectable option, not a one-way "reset" shortcut.
  const toggleAllParkTypes = useCallback(() => {
    setEnabledParkTypes(prev =>
      prev.size === PARK_TYPES.length ? new Set() : new Set(PARK_TYPES.map(t => t.key))
    );
    setSelectedPark(null);
  }, []);

  const counts: Record<FilterStatus, number> = {
    all:        visibleParks.length,
    visited:    visibleParks.filter(p => p.status === 'visited').length,
    bucketList: visibleParks.filter(p => p.status === 'bucketList').length,
    notVisited: visibleParks.filter(p => p.status === 'notVisited').length,
  };

  // Plain hex strings, not STATIC/dyn() DynamicColorIOS objects — these dots
  // render inside a plain View here so either would actually work, but kept
  // consistent with the same light/dark pairs used everywhere else.
  const statusOptions: StatusOption[] = FILTERS.map(f => ({
    key: f.key,
    label: f.label,
    count: counts[f.key],
    dot:
      f.key === 'all'        ? (isDarkScheme ? '#F0EAD9' : '#1B1A16') :
      f.key === 'visited'    ? (isDarkScheme ? '#4FA76C' : '#2F7A4A') :
      f.key === 'bucketList' ? (isDarkScheme ? '#D9A63E' : '#C48A20') :
      UNVISITED,
  }));

  const filteredParks =
    filterStatus === 'all'        ? visibleParks :
    filterStatus === 'notVisited' ? visibleParks.filter(p => p.status === 'notVisited' || p.status === 'bucketList') :
    visibleParks.filter(p => p.status === filterStatus);

  const visibleLabelCodes = useMemo(
    () => {
      const v = computeVisibleLabelCodes(
        filteredParks, labelRegion, labelFontSize / LABEL_FONT_DEFAULT, prevVisibleLabelsRef.current
      );
      prevVisibleLabelsRef.current = v;
      return v;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredParks, labelRegion, labelFontSize]
  );

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
          // Defaults false for a stale offline cache predating this field —
          // self-heals on the next successful online fetch (which always
          // saves a fresh cache), so this is a narrow, temporary edge case.
          is_national_park: p.is_national_park ?? false,
          designation: p.designation ?? null,
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
    if (tok) setToken(tok);
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
      setOfflineFetchedAt(isOnline && tok ? null : cache.fetchedAt);
      setLoading(false);
      hasLoadedRef.current = true;
    }

    // No token also covers Clerk still bootstrapping (e.g. offline at
    // startup) — fall back to cache same as being offline rather than hang.
    if (!isOnline || !tok) {
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
          is_national_park?: boolean; designation?: string | null;
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
    if (!tok) { setLoading(false); return; }
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

  // Fades the compass spinner out on completion instead of popping it off —
  // stays mounted through the animation, then unmounts once fully transparent.
  useEffect(() => {
    if (loading) {
      setShowLoadingOverlay(true);
      loadingOpacity.setValue(1);
    } else {
      Animated.timing(loadingOpacity, {
        toValue: 0, duration: 300, useNativeDriver: true,
      }).start(({ finished }) => { if (finished) setShowLoadingOverlay(false); });
    }
  }, [loading, loadingOpacity]);

  const loadVisitsRef = useRef(loadVisits);
  loadVisitsRef.current = loadVisits;
  // Refreshes parks/dot status on every focus-regain — which fires far more
  // often than just "switched tabs and back": pushing ANY screen on top of
  // the tabs navigator (log-visit, a journal entry, profile/edit, ...) also
  // blurs then re-focuses this screen when it's dismissed, since the sheet
  // is inline here now rather than a screen of its own insulating it from
  // that. This used to also clear `selectedPark` on every focus-regain —
  // reasonable-sounding, but wrong: it meant tapping "Log a visit" from the
  // sheet, then closing the log-visit modal, silently lost the sheet
  // instead of returning to it. Left out on purpose now; nothing here
  // clears `selectedPark` except an explicit close (drag/tap-the-map/the
  // close button/mapTabPress) — see dismissSheet and its callers.
  useFocusEffect(useCallback(() => {
    loadVisitsRef.current();
  }, []));

  // The half sheet covers the bottom half of the screen — a dot tapped down
  // there would otherwise vanish under it the instant the sheet opens. Pan
  // (never zoom, so the park's actual size on screen doesn't change) to put
  // it in the visible top quarter instead, the same "make room for the
  // place card" move Apple Maps makes. A dot already in the top half is
  // left alone — this is a correction for the sheet hiding it, not a
  // general recenter-on-select.
  const revealAboveSheet = useCallback((park: ParkForMap) => {
    const r = currentRegionRef.current;
    const yFracFromTop = 0.5 + (r.latitude - park.latitude) / r.latitudeDelta;
    if (yFracFromTop <= 0.5) return;
    mapRef.current?.animateToRegion(
      { ...r, latitude: park.latitude - 0.25 * r.latitudeDelta },
      350
    );
  }, []);

  // Marks the dot selected (bigger halo, visible beneath the sheet's half
  // detent) and presents the shared park profile page — ParkProfileScreen,
  // rendered inline near the bottom of this component's JSX (see
  // parkSheetProps below and its render site), keyed on park_code so
  // switching to a different park while one's already open remounts fresh
  // rather than reusing stale internal state. Never zooms — only pans, and
  // only if the sheet would otherwise hide the dot (see revealAboveSheet).
  // The map stays interactive underneath regardless (this is genuinely the
  // SAME screen, not a presented one — see park/[id].tsx's ParkDetailRoute
  // comment for why that matters), so tapping another dot just swaps
  // `selectedPark` in place instead of stacking anything.
  const handleSelectPark = useCallback((park: ParkForMap) => {
    setSelectedPark(park);
    revealAboveSheet(park);
  }, [revealAboveSheet]);

  // "View on full map" (park profile's mini-map button) wants a close,
  // single-park view, not just whatever pan/zoom the map already happens
  // to be at — unlike handleSelectPark/revealAboveSheet above (which
  // deliberately only pan, never zoom, for a plain dot tap). 0.08/0.08
  // reads as "this park and its immediate surroundings," similar to
  // tapping a single point of interest in most map apps.
  //
  // This flow always ends with the half-sheet open too (see
  // focusParkCode's effect below, which calls handleSelectPark right
  // alongside this) — centering directly on the park's own coordinates
  // would land the dot at screen-center, exactly where that half-sheet
  // covers it. Shifting the center latitude down by 0.25 * delta puts the
  // dot at the 25%-from-top mark instead — same target fraction
  // revealAboveSheet uses above, just computed against THIS call's own
  // (much smaller) delta rather than whatever the general map's current
  // delta happens to be, and applied unconditionally rather than only
  // when the dot would otherwise land in the covered half — unlike
  // revealAboveSheet (also used for a plain dot tap, where the dot is
  // often already comfortably visible and shouldn't be shifted for no
  // reason), this function is ONLY ever called right before the sheet
  // opens, so the shift is always warranted here.
  const zoomToPark = useCallback((latitude: number, longitude: number) => {
    const delta = 0.08;
    mapRef.current?.animateToRegion(
      { latitude: latitude - 0.25 * delta, longitude, latitudeDelta: delta, longitudeDelta: delta },
      500
    );
  }, []);

  // Deep links (park profile's "View on full map", passport stats) land here
  // with ?parkCode=X. Present that park's sheet exactly once per arrival:
  // consume the param immediately, with the ref bridging the frames until
  // the cleared param propagates — this effect re-runs on every parks
  // refresh, and a re-run must not re-present the sheet.
  useEffect(() => {
    if (!focusParkCode) { focusHandledRef.current = null; return; }
    if (parks.length === 0 || focusHandledRef.current === focusParkCode) return;
    const park = parks.find(p => p.park_code === focusParkCode);
    if (!park) return;
    focusHandledRef.current = focusParkCode;
    router.setParams({ parkCode: undefined, zoomClose: undefined });
    handleSelectPark(park);
    // Opt-in only (park profile's "View on full map" sets it) — the
    // passport stats deep-link hits this same param and should keep its
    // existing pan-only behavior, not suddenly start zooming in close too.
    if (focusZoomClose) zoomToPark(park.latitude, park.longitude);
  }, [focusParkCode, focusZoomClose, parks, handleSelectPark, router, zoomToPark]);

  // Lets other screens (e.g. the passport's Bucket stat) deep-link straight into
  // a pre-filtered map instead of dumping the user on "All" and making them tap it.
  useEffect(() => {
    if (!focusFilter) return;
    setFilterStatus(focusFilter);
  }, [focusFilter]);

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

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('mapTabPress', () => {
      // Same animate-then-clear path as tapping the map itself (see
      // MapView onPress below) — an open sheet needs to slide away, not
      // instantly vanish, when the tab bar's own map button resets the
      // view. selectedPark is cleared by the sheet's own onDismiss once
      // that animation finishes, not here. Filter/home reset stay
      // immediate either way — hidden behind the closing sheet at full,
      // and harmless to have already settled by the time it clears at half.
      if (selectedPark != null) {
        DeviceEventEmitter.emit('dismissParkSheet');
      }
      setFilterStatus('all');
      goHome();
    });
    return () => sub.remove();
  }, [goHome, selectedPark]);

  // "View on full map" from the INLINE sheet (park/[id].tsx, inSheet) —
  // map.tsx is already mounted/focused in that case (the sheet is a child
  // of this very screen), so a direct event is reliable, unlike the pushed-
  // page case below which uses the existing parkCode/zoomClose deep-link
  // params instead (map.tsx may not even be mounted yet when that fires).
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      'zoomToParkOnMap',
      ({ latitude, longitude }: { latitude: number; longitude: number }) => {
        zoomToPark(latitude, longitude);
      }
    );
    return () => sub.remove();
  }, [zoomToPark]);

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
        onRegionChangeComplete={region => {
          currentRegionRef.current = region;
          setLabelRegion(region);
        }}
        onPress={() => {
          // ParkProfileScreen's own root View sets pointerEvents:box-none
          // over the "gap" area above a half-height peek, so THIS handler
          // is what actually receives a tap there (the sheet's own content
          // stays interactive regardless — box-none only affects
          // otherwise-empty area). Emitting rather than clearing
          // selectedPark directly: only the sheet itself knows how to
          // close with its own animation (dismissSheet), so it listens for
          // this and drives its own dismissal, which THEN calls onDismiss
          // (below) to clear selectedPark once the animation finishes —
          // clearing it here instead would yank the sheet away instantly,
          // mid-animation.
          if (selectedPark != null) {
            DeviceEventEmitter.emit('dismissParkSheet');
          }
          setMapPressKey(k => k + 1);
        }}
      >
        {filteredParks.map(park => (
          <ParkMapMarker
            key={park.park_code}
            park={park}
            selected={selectedPark?.park_code === park.park_code}
            onSelect={handleSelectPark}
          />
        ))}
        {labelsEnabled && filteredParks.filter(park => visibleLabelCodes.has(park.park_code)).map(park => (
          // fontSize in the key: a size change fully remounts the marker so it
          // re-measures through the reliable initial-mount path — resetting
          // measurement state in place left pills invisible, because a mounted
          // marker view on Apple Maps never re-fires onLayout.
          <ParkLabelMarker key={`label-${park.park_code}-${labelFontSize}`} park={park} onSelect={handleSelectPark} fontSize={labelFontSize} />
        ))}
      </MapView>

      {offlineFetchedAt && (
        <View style={{ position: 'absolute', top: insets.top + 8, left: 0, right: 0 }}>
          <OfflineBanner fetchedAt={offlineFetchedAt} />
        </View>
      )}

      {showLoadingOverlay && (
        <Animated.View style={[styles.mapLoadingOverlay, { opacity: loadingOpacity }]} pointerEvents="none">
          <CompassSpinner size={36} dark />
        </Animated.View>
      )}

      {/* Map controls — Apple Maps' own grouping: independent buttons (Map
          Details, home) are circles, while the zoom pair share one rounded
          capsule split by a hairline divider — two separately-tappable
          halves, not two separate boxes. Single column, anchored by its
          bottom edge, so adding/removing buttons just grows it upward. */}
      <View style={[styles.mapControls, { bottom: insets.bottom + 68 }]}>
        <TouchableOpacity style={styles.mapControlCircle} onPress={() => setMapDetailsOpen(true)} activeOpacity={0.75}>
          <Ionicons name="options-outline" size={20} color={dyn('#4A4535', '#F0EAD9')} />
        </TouchableOpacity>

        <View style={styles.zoomGroup}>
          <TouchableOpacity style={styles.zoomBtn} onPress={zoomIn} activeOpacity={0.75}>
            <Ionicons name="add" size={22} color={dyn('#4A4535', '#F0EAD9')} />
          </TouchableOpacity>
          <View style={styles.zoomDivider} />
          <TouchableOpacity style={styles.zoomBtn} onPress={zoomOut} activeOpacity={0.75}>
            <Ionicons name="remove" size={22} color={dyn('#4A4535', '#F0EAD9')} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.mapControlCircle} onPress={goHome} activeOpacity={0.75}>
          <Ionicons name="home-outline" size={17} color={dyn('#4A4535', '#F0EAD9')} />
        </TouchableOpacity>
      </View>

      {/* Search — rendered before the sheet so results overlay the map
          chrome but not the other way around. Same +36 offline-banner delta
          filterPillWrap already uses below — this one was missing it, which
          is why the banner sat behind the search bar (nearly the same top
          offset) while filterPillWrap left a gap sized for a banner that
          never actually pushed anything else down. */}
      <View style={[styles.searchBarWrap, { top: insets.top + (offlineFetchedAt ? 48 : 12) }]}>
        <MapSearchBar
          token={token}
          parks={parks}
          closeSignal={mapPressKey}
          onSelectPark={handleSelectPark}
          onSelectUser={id => router.push(`/user/${id}` as never)}
        />
      </View>

      {/* Park-type quick-access chips — same toggleParkType/PARK_TYPES the
          Map Details sheet's checklist uses, just surfaced as one-tap
          shortcuts instead of buried in the sheet. PARK_TYPES is already
          ordered most-common-first (national parks, then historical parks,
          ...), so no separate sort here. */}
      <View style={[styles.chipRowWrap, { top: insets.top + (offlineFetchedAt ? 98 : 62) }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          <TouchableOpacity
            onPress={toggleAllParkTypes}
            activeOpacity={0.75}
            style={[styles.chip, enabledParkTypes.size === PARK_TYPES.length && styles.chipActive]}
          >
            <Text
              style={[styles.chipText, enabledParkTypes.size === PARK_TYPES.length && styles.chipTextActive]}
              numberOfLines={1}
            >
              All
            </Text>
          </TouchableOpacity>
          {PARK_TYPES.map(t => {
            const active = enabledParkTypes.has(t.key);
            return (
              <TouchableOpacity
                key={t.key}
                onPress={() => toggleParkType(t.key)}
                activeOpacity={0.75}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                  {t.label}
                </Text>
                <Text style={[styles.chipCount, active && styles.chipCountActive]}>
                  {parkTypeCounts[t.key] ?? 0}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* The park sheet itself. Rendered last so it paints over everything
          above BY DEFAULT, but several map overlays (searchBarWrap: 40,
          mapControls: 31, filterPillWrap/mapLoadingOverlay: 20) set an
          explicit zIndex — once ANY sibling does that, plain JSX order no
          longer decides stacking against it, so the sheet needs its own
          zIndex higher than all of them too, not just to come last. Kept
          on this wrapper rather than baked into ParkProfileScreen's own
          root style since it's specifically about outranking map.tsx's
          OTHER overlays — a concern that belongs where those zIndex values
          are visible together, not hardcoded into the shared component
          that also renders as the plain pushed page. box-none so the
          wrapper itself doesn't shadow the map interactivity fix (see this
          file's own memory note on activityState/pointerEvents ancestors —
          same class of bug: any plain wrapper here needs box-none too, or
          it silently re-blocks the gap). Keyed on park_code so switching
          to a different park while one's open remounts fresh (see
          handleSelectPark) rather than reusing stale internal state. */}
      {selectedPark && (
        <View style={styles.sheetWrap} pointerEvents="box-none">
          <ParkProfileScreen
            key={selectedPark.park_code}
            {...parkSheetProps(selectedPark)}
            inSheet
            onDismiss={() => setSelectedPark(null)}
          />
        </View>
      )}

      {mapDetailsOpen && (
        <MapDetailsSheet
          onClose={() => setMapDetailsOpen(false)}
          statusOptions={statusOptions}
          activeStatus={filterStatus}
          onSelectStatus={(key) => { setFilterStatus(key as FilterStatus); setSelectedPark(null); }}
          enabledParkTypes={enabledParkTypes}
          parkTypeCounts={parkTypeCounts}
          onToggleParkType={toggleParkType}
          onToggleAllParkTypes={toggleAllParkTypes}
          labelsEnabled={labelsEnabled}
          onLabelsEnabledChange={setLabelsEnabled}
          labelFontSize={labelFontSize}
          onLabelFontSizeChange={setLabelFontSize}
          labelFontMin={LABEL_FONT_MIN}
          labelFontMax={LABEL_FONT_MAX}
        />
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#CECDBC',
  },
  // Highest of every other zIndex in this file (searchBarWrap's 40 is the
  // current max) — see the render site's comment for why this needs to
  // beat them explicitly rather than relying on JSX order.
  sheetWrap: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 50,
  },

  // Search bar
  searchBarWrap: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 40,
    elevation: 10,
  },
  chipRowWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 39,
    elevation: 9,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: dyn('rgba(255,251,241,0.93)', 'rgba(32,29,23,0.93)'),
    borderWidth: 0.5,
    borderColor: C.hairline,
    borderRadius: 16,
    paddingHorizontal: 12,
    height: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 3,
  },
  // Inverted ink/bg fill, not a hue — a colored chip here would read as yet
  // another status color (the map already uses green/amber/gray for
  // visited/bucket/not-visited), same mistake the marker ring made earlier.
  chipActive: {
    backgroundColor: C.ink,
    borderColor: C.ink,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.inkSoft,
  },
  chipTextActive: {
    color: C.bg,
  },
  chipCount: {
    fontSize: 12,
    fontWeight: '600',
    color: C.inkMute,
    fontVariant: ['tabular-nums'],
  },
  chipCountActive: {
    color: C.bg,
    opacity: 0.7,
  },
  // Same input bar shape as the header's SearchOverlay (12pt radius, 10pt
  // vertical padding, 15pt text) — but filled with the warm translucent white
  // all the other floating map chrome (control buttons, filter pill) uses,
  // plus a soft shadow the overlay doesn't need.
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: dyn('rgba(255,251,241,0.93)', 'rgba(32,29,23,0.93)'),
    borderWidth: 0.5,
    borderColor: C.hairline,
    // Overshoots on purpose — a value past half the bar's own height just
    // clamps to a full pill (iOS 26's rounded search bar look) regardless
    // of how tall paddingVertical ends up making it.
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
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

  // Park name labels (floating, next to each dot)
  mapLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mapLabelPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: C.hairline,
    backgroundColor: dyn('rgba(255,251,241,0.9)', 'rgba(32,29,23,0.9)'),
  },
  mapLabelText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: C.ink,
  },
  mapControls: {
    position: 'absolute',
    right: 14,
    zIndex: 31,
    flexDirection: 'column',
    gap: 4,
  },
  mapControlCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: dyn('rgba(255,251,241,0.93)', 'rgba(32,29,23,0.93)'),
    borderWidth: 0.5,
    borderColor: C.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomGroup: {
    width: 44,
    borderRadius: 22,
    backgroundColor: dyn('rgba(255,251,241,0.93)', 'rgba(32,29,23,0.93)'),
    borderWidth: 0.5,
    borderColor: C.hairline,
    overflow: 'hidden',
  },
  zoomBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.hairline,
  },
  mapLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
});
