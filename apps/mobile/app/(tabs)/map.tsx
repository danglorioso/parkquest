import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, DeviceEventEmitter, Dimensions, Keyboard, LayoutAnimation, Platform,
  Pressable, StyleSheet, Switch,
  Text, TextInput, TouchableOpacity, View, useColorScheme,
  type ColorValue, type StyleProp, type ViewStyle,
} from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import Slider from '@react-native-community/slider';
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
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// The map already has every park loaded — carries it along as seed params so
// /park-sheet/[id] (the shared park profile — see that file) paints the hero
// instantly instead of opening on a blank spinner while it fetches nps/
// weather/visits itself. Mirrors logVisitParams' pattern elsewhere in the app.
function parkSheetParams(park: ParkForMap) {
  return {
    id: park.park_code, name: park.name, states: park.states,
    description: park.description ?? '',
    latitude: String(park.latitude), longitude: String(park.longitude),
    imageUrl: park.image_url ?? '',
    // The map already knows visited/bucket-list status (it's what colors
    // the dot) — seeding it lets the header buttons paint their final
    // "Log another visit" / "Edit last visit" set immediately instead of
    // opening as "Log a visit" and popping once the sheet's own /api/visits
    // fetch lands.
    status: park.status,
  };
}

// Concrete hex strings only — markers render into static bitmaps
// (tracksViewChanges={false}), and a DynamicColorIOS resolves at whatever
// theme was active when each marker happened to be snapshotted, leaving a
// mix of light- and dark-resolved borders after a theme change.
function markerConfig(status: ParkStatus, selected: boolean, dark: boolean) {
  const color =
    status === 'visited'    ? (dark ? '#4FA76C' : '#2F7A4A') :
    status === 'bucketList' ? (dark ? '#D9A63E' : '#C48A20') : UNVISITED;
  const border = dark ? '#201D17' : '#FFFBF1';
  const dotR  = selected ? 10 : status === 'visited' ? 7.5 : 6;
  const haloR = selected ? 17 : status === 'visited' ? 13  : 10;
  const haloOpacity = selected ? 0.24 : 0.15;
  return { color, border, dotR, haloR, haloOpacity };
}

// Strips the "National Park" designation for map labels, where space is tight —
// "Grand Canyon National Park" → "Grand Canyon". Handles the "X National Park &
// Preserve" / "National and State Parks" variants and the one park named
// "National Park of American Samoa" (designation is a prefix, not a suffix).
function shortParkName(name: string): string {
  return name
    .replace(/^National Park of /i, '')
    .replace(/ National (?:and State )?Parks?(?: (?:&|and) Preserve)?$/i, '')
    .trim();
}

// ── ParkMarker ────────────────────────────────────────────────────────────────

function ParkMarker({ park, selected }: { park: ParkForMap; selected: boolean }) {
  // Android is pinned to the light theme app-wide (see palette.tsx), so only
  // iOS ever resolves dark marker colors.
  const dark = useColorScheme() === 'dark' && Platform.OS === 'ios';
  const { color, border, dotR, haloR, haloOpacity } = markerConfig(park.status, selected, dark);
  // Outer box is ALWAYS sized for the selected (largest) halo, never the
  // actual current haloR — when the marker's own declared size changes in
  // the same tick tracksViewChanges goes live (both happen together on
  // select/deselect, see ParkMapMarker), MapKit briefly re-anchors the
  // resized native view at its (0,0) corner instead of re-centering it on
  // the geo coordinate, reading as the dot jumping to the top-left of the
  // map for a frame. A fixed outer box means selecting only changes what's
  // drawn INSIDE a view whose own size never moves, so there's nothing for
  // MapKit to re-anchor.
  const maxSz = markerConfig(park.status, true, dark).haloR * 2;
  return (
    <View style={{ width: maxSz, height: maxSz, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{
        position: 'absolute',
        width: haloR * 2, height: haloR * 2, borderRadius: haloR,
        backgroundColor: color, opacity: haloOpacity,
      }} />
      <View style={{
        width: dotR * 2, height: dotR * 2, borderRadius: dotR,
        backgroundColor: color,
        borderWidth: selected ? 2 : 1.5,
        borderColor: border,
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
          style={styles.mapLabelPill}
          onLayout={e => {
            const w = Math.ceil(e.nativeEvent.layout.width);
            setPillW(prev => (prev === w ? prev : w));
          }}
        >
          <Text style={[styles.mapLabelText, { fontSize }]} numberOfLines={1}>
            {shortParkName(park.name)}
          </Text>
        </View>
      </View>
    </Marker>
  );
}

// ── Menu dropdown ─────────────────────────────────────────────────────────────
// System-menu-style presentation for the custom map dropdowns (filter pill +
// labels menu). LayoutAnimation can't animate child mounts under Fabric, so
// these snapped open; this mimics UIMenu instead — springs open scaling up
// from the anchor corner, and shrinks/fades out quickly on close. Content
// stays mounted until the close animation finishes.
function MenuDropdown({
  visible, style, origin = 'top left', children,
}: {
  visible: boolean;
  style?: StyleProp<ViewStyle>;
  origin?: 'top left' | 'top right';
  children: React.ReactNode;
}) {
  const [render, setRender] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setRender(true);
      Animated.spring(progress, {
        toValue: 1, useNativeDriver: true,
        damping: 24, stiffness: 350, mass: 0.8,
      }).start();
    } else {
      Animated.timing(progress, {
        toValue: 0, duration: 160, useNativeDriver: true,
      }).start(({ finished }) => { if (finished) setRender(false); });
    }
  }, [visible, progress]);

  if (!render) return null;
  return (
    <Animated.View
      style={[style, {
        transformOrigin: origin,
        opacity: progress,
        transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
      }]}
    >
      {children}
    </Animated.View>
  );
}

// ── FilterPill ────────────────────────────────────────────────────────────────

const FILTERS: Array<{ key: FilterStatus; dot: ColorValue; label: string }> = [
  { key: 'all',        dot: C.ink,       label: 'ALL'    },
  { key: 'visited',    dot: C.visited,   label: 'VISITED'},
  { key: 'bucketList', dot: C.bucket,    label: 'BUCKET' },
  { key: 'notVisited', dot: UNVISITED, label: 'TO GO'  },
];

// Collapsed by default (a single chip showing the active filter) so it doesn't
// permanently occupy the map — tapping it drops a menu of the four options
// below the chip; picking one (even the already-active one, so tapping it is
// also how you close without changing anything) closes the menu.
function FilterPill({
  active, counts, expanded, onToggle, onSelect,
}: {
  active: FilterStatus;
  counts: Record<FilterStatus, number>;
  expanded: boolean;
  onToggle: () => void;
  onSelect: (f: FilterStatus) => void;
}) {
  const activeFilter = FILTERS.find(f => f.key === active)!;

  return (
    <View>
      <TouchableOpacity
        onPress={onToggle}
        activeOpacity={0.75}
        style={styles.pillCollapsed}
      >
        <View style={[styles.pillDot, { backgroundColor: activeFilter.dot }]} />
        <Text style={styles.pillCollapsedText} numberOfLines={1}>
          {counts[active]} {activeFilter.label}
        </Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={12} color={C.inkMute} />
      </TouchableOpacity>

      <MenuDropdown visible={expanded} style={styles.pillDropdown}>
          {FILTERS.map((f, i) => (
            <TouchableOpacity
              key={f.key}
              onPress={() => onSelect(f.key)}
              activeOpacity={0.7}
              style={[
                styles.pillDropdownRow,
                i < FILTERS.length - 1 && styles.pillDropdownRowBorder,
                active === f.key && styles.pillBtnActive,
              ]}
            >
              <View style={[styles.pillDot, { backgroundColor: f.dot }]} />
              <Text style={[styles.pillCount, active === f.key && styles.pillCountActive]}>
                {counts[f.key]}
              </Text>
              <Text style={[styles.pillLabel, active === f.key && styles.pillLabelActive]}>
                {f.label}
              </Text>
              {active === f.key && (
                <Ionicons name="checkmark" size={14} color={C.ink} style={styles.pillDropdownCheck} />
              )}
            </TouchableOpacity>
          ))}
      </MenuDropdown>
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
  const { parkCode: focusParkCode, filter: focusFilter } = useLocalSearchParams<{ parkCode?: string; filter?: FilterStatus }>();

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
  // True while the park-profile form sheet is presented over the map.
  const sheetOpenRef = useRef(false);
  // Last ?parkCode= deep-link value already presented (see the effect below).
  const focusHandledRef = useRef<string | null>(null);
  const rawParksRef = useRef<Array<{
    park_code: string; name: string; states: string;
    latitude: string | null; longitude: string | null;
    description: string | null; image_url: string | null;
  }>>([]);
  const currentRegionRef = useRef({ latitude: 39.0, longitude: -98.5, latitudeDelta: 35, longitudeDelta: 55 });
  // Drives the label declutter recompute below — kept separate from
  // currentRegionRef (read synchronously by zoomIn/zoomOut/goHome without waiting
  // on a re-render) since this one exists purely to trigger the useMemo.
  const [labelRegion, setLabelRegion] = useState(currentRegionRef.current);
  const [labelsEnabled, setLabelsEnabled] = useState(true);
  const [labelFontSize, setLabelFontSize] = useState(LABEL_FONT_DEFAULT);
  const [labelMenuOpen, setLabelMenuOpen] = useState(false);
  const [filterExpanded, setFilterExpanded] = useState(false);
  // Last declutter result — fed back in as the sticky set so still-fitting
  // labels survive font-size changes and region nudges.
  const prevVisibleLabelsRef = useRef<Set<string>>(new Set());

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
  useFocusEffect(useCallback(() => {
    loadVisitsRef.current();
    // Focus returning means the park sheet (if any) was dismissed — while
    // it's up, this screen sits blurred beneath it even though the half
    // detent leaves the map visible and interactive.
    sheetOpenRef.current = false;
    setSelectedPark(null);
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
  // detent) and presents the shared park profile page — /park-sheet/[id]
  // renders the SAME component as /park/[id] — as a native form sheet over
  // the map. Never zooms — only pans, and only if the sheet would otherwise
  // hide the dot (see revealAboveSheet). While a sheet is up the undimmed
  // map stays interactive, so tapping another dot swaps the sheet in place
  // instead of stacking one sheet per tap.
  const handleSelectPark = useCallback((park: ParkForMap) => {
    setSelectedPark(park);
    revealAboveSheet(park);
    const href = { pathname: '/park-sheet/[id]', params: parkSheetParams(park) } as never;
    if (sheetOpenRef.current) {
      router.replace(href);
    } else {
      sheetOpenRef.current = true;
      router.push(href);
    }
  }, [router, revealAboveSheet]);

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
    router.setParams({ parkCode: undefined });
    handleSelectPark(park);
  }, [focusParkCode, parks, handleSelectPark, router]);

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
      setSelectedPark(null);
      setFilterStatus('all');
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
        onRegionChangeComplete={region => {
          currentRegionRef.current = region;
          setLabelRegion(region);
        }}
        onPress={() => {
          // The park sheet (park-sheet/[id].tsx) is a transparentModal —
          // its own root View sets pointerEvents:box-none over the "gap"
          // area above a half-height peek, so THIS handler is what
          // actually receives a tap there (the sheet's own content stays
          // interactive regardless — box-none only affects otherwise-empty
          // area). Emitting rather than calling router.back() directly:
          // only the sheet screen itself knows how to close with its own
          // animation (dismissSheet), so it listens for this and drives
          // its own dismissal — this just signals "user tapped away."
          if (sheetOpenRef.current) {
            DeviceEventEmitter.emit('dismissParkSheet');
          }
          setSelectedPark(null);
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

      {(filterExpanded || labelMenuOpen) && (
        <Pressable
          style={styles.filterBackdrop}
          onPress={() => { setFilterExpanded(false); setLabelMenuOpen(false); }}
        />
      )}

      <View
        style={[styles.filterPillWrap, { top: insets.top + (offlineFetchedAt ? 96 : 60) }]}
        pointerEvents="box-none"
      >
        <FilterPill
          active={filterStatus}
          counts={counts}
          expanded={filterExpanded}
          onToggle={() => {
            setFilterExpanded(v => !v);
            setLabelMenuOpen(false);
          }}
          onSelect={f => {
            LayoutAnimation.configureNext(LayoutAnimation.create(200, 'easeInEaseOut', 'opacity'));
            setFilterStatus(f);
            setSelectedPark(null);
            setFilterExpanded(false);
          }}
        />

        {/* Labels button — opens a menu with the visibility toggle + size options */}
        <View>
          <TouchableOpacity
            style={styles.mapControlBtn}
            onPress={() => {
              setLabelMenuOpen(v => !v);
              setFilterExpanded(false);
            }}
            activeOpacity={0.75}
          >
            <View style={styles.mapLabelToggleIcon}>
              <Ionicons name="text" size={16} color={dyn('#4A4535', '#F0EAD9')} />
              {!labelsEnabled && (
                <View style={[styles.mapLabelToggleSlash, { backgroundColor: dyn('#4A4535', '#F0EAD9') }]} />
              )}
            </View>
          </TouchableOpacity>

          <MenuDropdown visible={labelMenuOpen} style={[styles.pillDropdown, { minWidth: 208, marginTop: 2 }]}>
              <View style={[styles.pillDropdownRow, { paddingVertical: 6 }]}>
                <Text style={[styles.pillLabel, styles.pillLabelActive]}>Show labels</Text>
                <Switch
                  value={labelsEnabled}
                  onValueChange={setLabelsEnabled}
                  trackColor={{ true: C.visited as string }}
                  style={[styles.pillDropdownCheck, { transform: [{ scale: 0.75 }] }]}
                />
              </View>
              {/* Text size — native UISlider; the small/large "A"s bracket it */}
              <View style={[styles.pillDropdownRow, styles.pillDropdownRowBorder, !labelsEnabled && { opacity: 0.4 }]}>
                <Text style={[styles.pillLabel, { fontSize: 10 }]}>A</Text>
                <Slider
                  style={{ flex: 1, height: 28 }}
                  minimumValue={LABEL_FONT_MIN}
                  maximumValue={LABEL_FONT_MAX}
                  step={0.5}
                  value={labelFontSize}
                  onValueChange={setLabelFontSize}
                  disabled={!labelsEnabled}
                  minimumTrackTintColor={C.visited as string}
                  maximumTrackTintColor={C.hairline as string}
                />
                <Text style={[styles.pillLabel, { fontSize: 16 }]}>A</Text>
              </View>
          </MenuDropdown>
        </View>
      </View>

      {showLoadingOverlay && (
        <Animated.View style={[styles.mapLoadingOverlay, { opacity: loadingOpacity }]} pointerEvents="none">
          <CompassSpinner size={36} dark />
        </Animated.View>
      )}

      {/* Map controls — the park sheet presents over these in its own native
          layer, so they need no sheet-aware repositioning or z-juggling. */}
      <View style={[styles.mapControls, { bottom: insets.bottom + 68 }]}>
        <TouchableOpacity style={styles.mapControlBtn} onPress={zoomIn} activeOpacity={0.75}>
          <Ionicons name="add" size={18} color={dyn('#4A4535', '#F0EAD9')} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.mapControlBtn} onPress={zoomOut} activeOpacity={0.75}>
          <Ionicons name="remove" size={18} color={dyn('#4A4535', '#F0EAD9')} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.mapControlBtn} onPress={goHome} activeOpacity={0.75}>
          <Ionicons name="home-outline" size={14} color={dyn('#4A4535', '#F0EAD9')} />
        </TouchableOpacity>
      </View>

      {/* Search — rendered last so results overlay the map chrome */}
      <View style={[styles.searchBarWrap, { top: insets.top + 12 }]}>
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
    borderRadius: 12,
    paddingHorizontal: 12,
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
  mapLabelToggleIcon: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapLabelToggleSlash: {
    position: 'absolute',
    width: 20,
    height: 1.5,
    borderRadius: 1,
    transform: [{ rotate: '-45deg' }],
  },

  // Filter pill row — left-aligned trigger chip + label toggle button side by
  // side; the dropdown menu opens below the trigger chip (see pillDropdown).
  filterPillWrap: {
    position: 'absolute',
    left: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 20,
  },
  filterBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 19,
  },
  pillCollapsed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: dyn('rgba(255,251,241,0.92)', 'rgba(32,29,23,0.92)'),
    borderWidth: 0.5,
    borderColor: C.hairline,
    // Matches mapControlBtn (home/zoom buttons) exactly
    borderRadius: 9,
    paddingVertical: 8,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  pillCollapsedText: {
    fontSize: 13,
    fontWeight: '700',
    color: C.ink,
  },
  pillDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: 6,
    minWidth: 170,
    backgroundColor: dyn('rgba(255,251,241,0.97)', 'rgba(32,29,23,0.97)'),
    // No borderWidth — border + radius rendered as a broken bright edge in
    // dark mode (same RN border-drawing artifact as the date sheet's band).
    // 13pt radius + deep soft shadow — the UIMenu look
    borderRadius: 13,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  pillDropdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  pillDropdownRowBorder: {
    borderBottomWidth: 0.5,
    borderBottomColor: C.hairline,
  },
  pillDropdownCheck: {
    marginLeft: 'auto',
  },
  mapControls: {
    position: 'absolute',
    right: 14,
    zIndex: 31,
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
  mapLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  pillBtnActive: {
    backgroundColor: dyn('rgba(31,61,46,0.10)', 'rgba(240,234,217,0.16)'),
  },
  pillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
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
});
