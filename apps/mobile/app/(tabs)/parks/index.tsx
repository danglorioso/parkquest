import {
  Animated, Dimensions, Easing, FlatList, Keyboard, Linking, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useColorScheme,
  type ColorValue,
} from 'react-native';
// expo-image, not RN Image: the offline download prefetches park photos into
// expo-image's disk cache — RN's core Image uses a separate URL cache and
// would re-download every cover from the network on each cold open.
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useScrollToTop } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { MenuView } from '@react-native-menu/menu';
import { PARK_TYPES, DEFAULT_PARK_TYPES, parkTypeCollapsedLabel } from '@/lib/parkTypes';
import * as Location from 'expo-location';
import { fullStateName } from '@/lib/stateNames';
import { consumeParkFilterIntent } from '@/lib/parkFilterIntent';
import { STATIC as C, useColors } from '@/lib/palette';
import { parkGradient } from '@/lib/parkColors';
import { useTabBarSpace } from '@/components/FloatingTabBar';
import { loadOfflineParks, saveOfflineParks } from '@/lib/offlineParks';
import { OfflineBanner } from '@/components/OfflineBanner';
import { useIsOnline } from '@/lib/network';
import { hasSeenLocationPrompt, markLocationPromptSeen, distanceMiles } from '@/lib/location';
import { LocationPermissionModal } from '@/components/LocationPermissionModal';
import { GlassIconBg } from '@/components/GlassIconBg';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
const CARD_GAP = 14;
const SCREEN_W = Dimensions.get('window').width;
const H_PAD = 16;
const CARD_W = (SCREEN_W - H_PAD * 2 - CARD_GAP) / 2;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Park {
  park_code: string;
  name: string;
  states: string;
  description: string | null;
  image_url: string | null;
  latitude: string | null;
  longitude: string | null;
  is_national_park?: boolean;
  designation?: string | null;
}

interface Visit {
  park_code: string;
  is_bucket_list: boolean;
  visited_date: string | null;
}

type ParkStatus = 'visited' | 'bucketList' | 'notVisited';
type StatusFilter = 'all' | 'visited' | 'bucketList' | 'notVisited';
type SortBy = 'closest' | 'az' | 'za';

// ── Constants ─────────────────────────────────────────────────────────────────

const REGIONS = [
  { label: 'Northeast',     states: ['CT','ME','MA','NH','NJ','NY','PA','RI','VT'] },
  { label: 'Mid-Atlantic',  states: ['DC','DE','MD','NC','VA','WV'] },
  { label: 'Southeast',     states: ['AL','AR','FL','GA','KY','LA','MS','SC','TN'] },
  { label: 'Midwest',       states: ['IL','IN','IA','KS','MI','MN','MO','NE','ND','OH','SD','WI'] },
  { label: 'Southwest',     states: ['AZ','NM','OK','TX'] },
  { label: 'Mountain West', states: ['CO','ID','MT','NV','UT','WY'] },
  { label: 'Pacific Coast', states: ['CA','OR','WA'] },
  { label: 'Alaska',        states: ['AK'] },
  { label: 'Hawaii',        states: ['HI'] },
  { label: 'Territories',   states: ['AS','GU','MP','PR','VI'] },
];

const STATUS_FILTERS: Array<{ key: StatusFilter; label: string; color: ColorValue }> = [
  { key: 'all',        label: 'All',         color: C.ink },
  { key: 'visited',    label: 'Visited',     color: C.visited },
  { key: 'bucketList', label: 'Bucket list', color: C.bucket },
  { key: 'notVisited', label: 'To explore',  color: C.inkMute },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function gradientColors(code: string): [string, string] {
  const g = parkGradient(code);
  return [g[0], g[1]];
}

function parkStatus(code: string, visits: Visit[]): ParkStatus {
  const pv = visits.filter(v => v.park_code === code);
  if (pv.some(v => !v.is_bucket_list && v.visited_date)) return 'visited';
  if (pv.some(v => v.is_bucket_list)) return 'bucketList';
  return 'notVisited';
}

function parkDistance(park: Park, loc: { lat: number; lng: number } | null): number | null {
  if (!loc || !park.latitude || !park.longitude) return null;
  return distanceMiles(loc.lat, loc.lng, parseFloat(park.latitude), parseFloat(park.longitude));
}

function formatDistance(mi: number): string {
  return mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`;
}

async function apiFetch<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  const [g1, g2] = ['#1F3D2E', '#2F7A4A'];
  return (
    <View style={[styles.card, { width: CARD_W }]}>
      <View style={[styles.cardImg, { backgroundColor: g1 }]} />
      <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14, gap: 7 }}>
        <View style={{ width: 40, height: 8, borderRadius: 4, backgroundColor: C.surfaceAlt }} />
        <View style={{ width: '80%', height: 13, borderRadius: 5, backgroundColor: C.surfaceAlt }} />
        <View style={{ width: '100%', height: 10, borderRadius: 4, backgroundColor: C.surfaceAlt }} />
        <View style={{ width: '60%', height: 10, borderRadius: 4, backgroundColor: C.surfaceAlt }} />
      </View>
    </View>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ParkStatus }) {
  if (status === 'notVisited') return null;
  return (
    <View style={[styles.statusBadge, {
      backgroundColor: status === 'visited' ? C.visited : C.bucket,
    }]}>
      <Ionicons
        name={status === 'visited' ? 'checkmark' : 'bookmark'}
        size={13} color="#FFFBF1"
      />
    </View>
  );
}

// ── Park card ─────────────────────────────────────────────────────────────────

// Cards above the fold should win the image-fetch queue over ones the user
// hasn't scrolled to yet — expo-image's underlying downloader (SDWebImage/
// Glide) serves 'high' priority requests before 'low' ones regardless of
// render order, so without this the last row of the initial batch can finish
// before the first.
const PRIORITY_CUTOFF = 10;
function imagePriority(index: number): 'high' | 'low' {
  return index < PRIORITY_CUTOFF ? 'high' : 'low';
}

function ParkCard({
  park, status, descLines = 2, onTitleLayout, distance, priority = 'high',
}: { park: Park; status: ParkStatus; descLines?: number; onTitleLayout?: (lines: number) => void; distance?: number | null; priority?: 'high' | 'low' }) {
  const router = useRouter();
  const [imgFailed, setImgFailed] = useState(false);
  const [g1] = gradientColors(park.park_code);
  const stateCode = park.states.split(',')[0].trim();
  const stateName = fullStateName(stateCode);

  return (
    <TouchableOpacity
      onPress={() => router.push(`/park/${park.park_code}` as never)}
      style={[styles.card, { width: CARD_W }]}
      activeOpacity={0.85}
    >
      <View style={[styles.cardImg, { backgroundColor: g1 }]}>
        {park.image_url && !imgFailed && (
          <Image
            source={{ uri: park.image_url }}
            style={StyleSheet.absoluteFill as any}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={0}
            priority={priority}
            onError={() => setImgFailed(true)}
          />
        )}
        <View style={styles.cardImgOverlay} />
        <StatusBadge status={status} />
      </View>
      <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
          {/* Long state names fall back to the two-letter code when the
              distance shares the line — "New Hampshire" + "2333 mi" can't
              both fit a half-width card. flex keeps them from ever
              overlapping regardless. */}
          <Text style={[styles.cardState, { marginBottom: 0, flexShrink: 1 }]} numberOfLines={1}>
            {distance != null && stateName.length > 12 ? stateCode : stateName}
          </Text>
          {distance != null && (
            <Text style={[styles.cardState, { marginBottom: 0, flexShrink: 0 }]} numberOfLines={1}>{formatDistance(distance)}</Text>
          )}
        </View>
        <Text
          style={styles.cardName}
          numberOfLines={2}
          onTextLayout={onTitleLayout ? (e) => onTitleLayout(e.nativeEvent.lines.length) : undefined}
        >
          {park.name}
        </Text>
        {park.description ? (
          <Text style={styles.cardDesc} numberOfLines={descLines}>{park.description}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

// Grid row of two cards. Cards stretch to equal height, so a title that wraps
// to 2 lines on one side leaves spare height on the other — give that side's
// description the extra line instead of truncating it needlessly.
function ParkCardRow({
  left, right, visits, userLocation, startIndex,
}: { left: Park; right: Park | null; visits: Visit[]; userLocation: { lat: number; lng: number } | null; startIndex: number }) {
  const [leftTitleLines, setLeftTitleLines] = useState(1);
  const [rightTitleLines, setRightTitleLines] = useState(1);
  const maxTitleLines = Math.max(leftTitleLines, rightTitleLines);

  return (
    <View style={styles.rowWrap}>
      <ParkCard
        park={left}
        status={parkStatus(left.park_code, visits)}
        descLines={2 + (maxTitleLines - leftTitleLines)}
        onTitleLayout={setLeftTitleLines}
        distance={parkDistance(left, userLocation)}
        priority={imagePriority(startIndex)}
      />
      {right
        ? (
          <ParkCard
            park={right}
            status={parkStatus(right.park_code, visits)}
            descLines={2 + (maxTitleLines - rightTitleLines)}
            onTitleLayout={setRightTitleLines}
            distance={parkDistance(right, userLocation)}
            priority={imagePriority(startIndex + 1)}
          />
        )
        : <View style={{ width: CARD_W }} />
      }
    </View>
  );
}

function ParkListRow({
  park, status, visitCount, distance, priority = 'high',
}: { park: Park; status: ParkStatus; visitCount: number; distance?: number | null; priority?: 'high' | 'low' }) {
  const router = useRouter();
  const [imgFailed, setImgFailed] = useState(false);
  const [g1] = gradientColors(park.park_code);
  const stateCode = park.states.split(',')[0].trim();
  const stateName = fullStateName(stateCode);

  const statusLine =
    status === 'visited'    ? `Visited · ${visitCount} ${visitCount === 1 ? 'trip' : 'trips'}` :
    status === 'bucketList' ? 'On bucket list' :
    distance != null        ? formatDistance(distance) :
    null;
  const statusColor =
    status === 'visited'    ? C.visited :
    status === 'bucketList' ? C.bucket  :
    C.inkMute;

  return (
    <TouchableOpacity
      onPress={() => router.push(`/park/${park.park_code}` as never)}
      style={styles.listCard}
      activeOpacity={0.85}
    >
      <View style={[styles.listCardImg, { backgroundColor: g1 }]}>
        {park.image_url && !imgFailed && (
          <Image
            source={{ uri: park.image_url }}
            style={StyleSheet.absoluteFill as any}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={0}
            priority={priority}
            onError={() => setImgFailed(true)}
          />
        )}
        <View style={styles.cardImgOverlay} />
        <StatusBadge status={status} />
      </View>
      <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 1 }}>
          <Text style={styles.cardState} numberOfLines={1}>{stateName}</Text>
          {statusLine && (
            <Text style={[styles.cardState, { color: statusColor, fontWeight: '600' }]} numberOfLines={1}>
              {statusLine}
            </Text>
          )}
        </View>
        <Text style={styles.cardName} numberOfLines={2}>{park.name}</Text>
        {park.description ? (
          <Text style={styles.cardDesc} numberOfLines={4}>{park.description}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

// ── Filter panel ──────────────────────────────────────────────────────────────

type FilterSection = 'status' | 'location' | 'activities' | 'topics';

function Chip({
  label, active, dot, onPress,
}: { label: string; active: boolean; dot?: ColorValue; onPress: () => void }) {
  const { primary } = useColors();
  return (
    <TouchableOpacity
      onPress={onPress} activeOpacity={0.7}
      style={[styles.pill, active && [styles.pillActive, { backgroundColor: primary, borderColor: primary }]]}
    >
      {dot ? <View style={[styles.pillDot, { backgroundColor: dot }]} /> : null}
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  const { primary } = useColors();
  return (
    <View style={[styles.activeChip, { borderColor: primary }]}>
      <Text style={[styles.activeChipText, { color: primary }]} numberOfLines={1}>{label}</Text>
      <TouchableOpacity onPress={onRemove} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
        <Ionicons name="close" size={11} color={primary} />
      </TouchableOpacity>
    </View>
  );
}

// Accordion body for the filter sections. LayoutAnimation can't animate child
// mounts under Fabric, so `{open && children}` snapped — instead children stay
// permanently mounted inside a clipped view whose height animates between 0
// and the content's measured natural height (the park page Section pattern).
// Layout captures are ignored mid-animation: a shrinking/growing clip ancestor
// propagates transient constraints down and would corrupt the measured height.
function Collapsible({ open, children }: { open: boolean; children: React.ReactNode }) {
  const [contentH, setContentH] = useState(0);
  const anim = useRef(new Animated.Value(open ? 1 : 0)).current;
  const animating = useRef(false);
  const prevOpen = useRef(open);

  useEffect(() => {
    if (prevOpen.current === open) return;
    prevOpen.current = open;
    animating.current = true;
    Animated.timing(anim, { toValue: open ? 1 : 0, duration: 220, easing: Easing.inOut(Easing.cubic), useNativeDriver: false })
      .start(() => { animating.current = false; });
  }, [open, anim]);

  return (
    <Animated.View
      pointerEvents={open ? 'auto' : 'none'}
      style={{
        overflow: 'hidden',
        opacity: anim,
        height: contentH ? anim.interpolate({ inputRange: [0, 1], outputRange: [0, contentH] }) : open ? undefined : 0,
      }}
    >
      <View
        onLayout={e => {
          const h = e.nativeEvent.layout.height;
          if (!animating.current && h > 0 && h !== contentH) setContentH(h);
        }}
      >
        {children}
      </View>
    </Animated.View>
  );
}

const SORT_OPTIONS: Array<{ key: SortBy; label: string; icon: string }> = [
  { key: 'closest', label: 'Closest',  icon: 'location.fill' },
  { key: 'az',      label: 'A to Z',   icon: 'arrow.up' },
  { key: 'za',      label: 'Z to A',   icon: 'arrow.down' },
];

function FilterPanel({
  statusFilter, onStatusFilter,
  regionFilters, onRegionToggle, onClearRegions,
  activityFilters, onActivityToggle, onClearActivities,
  topicFilters, onTopicToggle, onClearTopics,
  allActivities, allTopics, filtersLoading,
  hasFilter, onReset,
  sortBy, onSortChange,
  enabledParkTypes, parkTypeCounts, onToggleParkType,
}: {
  statusFilter: StatusFilter; onStatusFilter: (s: StatusFilter) => void;
  regionFilters: string[]; onRegionToggle: (r: string) => void; onClearRegions: () => void;
  activityFilters: string[]; onActivityToggle: (a: string) => void; onClearActivities: () => void;
  topicFilters: string[]; onTopicToggle: (t: string) => void; onClearTopics: () => void;
  allActivities: string[]; allTopics: string[]; filtersLoading: boolean;
  hasFilter: boolean; onReset: () => void;
  sortBy: SortBy; onSortChange: (s: SortBy) => void;
  enabledParkTypes: Set<string>; parkTypeCounts: Record<string, number>; onToggleParkType: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [renderPanel, setRenderPanel] = useState(false);
  // True once the open animation finishes — releases the maxHeight clamp so
  // accordion sections inside can expand/collapse freely without being capped
  // by whatever height was measured at panel-open time.
  const [settled, setSettled] = useState(false);
  // Real measured content height, kept current via onLayout — the animation
  // grows toward this instead of an arbitrary constant, so the panel (and the
  // park cards below it in the list) glide open instead of snapping to size.
  const [panelHeight, setPanelHeight] = useState(0);
  const [section, setSection] = useState<FilterSection | null>(null);
  const { primary, accent } = useColors();
  const panelAnim = useRef(new Animated.Value(0)).current;
  const menuInk = useColorScheme() === 'dark' ? '#FFFBF1' : '#26231C';

  const activeCount =
    (statusFilter !== 'all' ? 1 : 0) +
    regionFilters.length +
    activityFilters.length +
    topicFilters.length;

  const togglePanel = () => {
    if (open) {
      setSettled(false);
      setOpen(false);
      setSection(null);
      Animated.timing(panelAnim, {
        toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: false,
      }).start(({ finished }) => { if (finished) setRenderPanel(false); });
    } else {
      setRenderPanel(true);
      setOpen(true);
      panelAnim.setValue(0);
      Animated.timing(panelAnim, {
        toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: false,
      }).start(({ finished }) => { if (finished) setSettled(true); });
    }
  };

  const toggleSection = (s: FilterSection) => {
    setSection(prev => (prev === s ? null : s));
  };

  // Switching tabs away should collapse the filters dropdown — snapped shut
  // instantly (no animation) since the screen isn't visible, so it never
  // resumes mid-expanded next time this tab is focused.
  useFocusEffect(useCallback(() => {
    return () => {
      setOpen(false);
      setSection(null);
      setSettled(false);
      setRenderPanel(false);
      panelAnim.setValue(0);
    };
  }, [panelAnim]));

  const statusLabel = STATUS_FILTERS.find(f => f.key === statusFilter)?.label ?? 'All';

  const sections: Array<{
    key: FilterSection;
    title: string;
    summary: string;
    hasSelection: boolean;
  }> = [
    { key: 'status',     title: 'Status',     summary: statusLabel, hasSelection: statusFilter !== 'all' },
    { key: 'location',   title: 'Location',   summary: regionFilters.length > 0 ? `${regionFilters.length} selected` : 'All regions', hasSelection: regionFilters.length > 0 },
    { key: 'activities', title: 'Activities', summary: activityFilters.length > 0 ? `${activityFilters.length} selected` : 'Any', hasSelection: activityFilters.length > 0 },
    { key: 'topics',     title: 'Topics',     summary: topicFilters.length > 0 ? `${topicFilters.length} selected` : 'Any', hasSelection: topicFilters.length > 0 },
  ];

  return (
    <View style={styles.filterWrap}>
      {/* Toggle row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TouchableOpacity
          style={[styles.filterToggle, (open || activeCount > 0) && [styles.filterToggleActive, { backgroundColor: primary, borderColor: primary }]]}
          onPress={togglePanel}
          activeOpacity={0.75}
        >
          <Ionicons
            name="options-outline" size={15}
            color={open || activeCount > 0 ? C.onPrimary : C.inkSoft}
          />
          <Text style={[styles.filterToggleText, (open || activeCount > 0) && { color: C.onPrimary }]}>
            Filters
          </Text>
          {activeCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={[styles.filterBadgeText, { color: primary }]}>{activeCount}</Text>
            </View>
          )}
          <Ionicons
            name={open ? 'chevron-up' : 'chevron-down'} size={13}
            color={open || activeCount > 0 ? C.onPrimary : C.inkMute}
          />
        </TouchableOpacity>

        {hasFilter && (
          <TouchableOpacity onPress={onReset} activeOpacity={0.7} style={styles.pillReset}>
            <Ionicons name="close-circle" size={14} color={accent} />
            <Text style={[styles.pillResetText, { color: accent }]}>Reset</Text>
          </TouchableOpacity>
        )}

        {/* Park type — real native UIMenu, same taxonomy/behavior as the map
            tab's filter (see lib/parkTypes). Multi-select checkable rows,
            not a single-active toggle. */}
        <MenuView
          onPressAction={({ nativeEvent }) => onToggleParkType(nativeEvent.event)}
          actions={PARK_TYPES.map(t => ({
            id: t.key,
            title: t.label,
            subtitle: String(parkTypeCounts[t.key] ?? 0),
            state: enabledParkTypes.has(t.key) ? 'on' : 'off',
          }))}
        >
          <View style={styles.filterToggle}>
            <Ionicons name="pricetags-outline" size={15} color={C.inkSoft} />
            <Text style={styles.filterToggleText} numberOfLines={1}>
              {parkTypeCollapsedLabel(enabledParkTypes)}
            </Text>
          </View>
        </MenuView>

        {/* Spacer pushes the sort control to the right edge */}
        <View style={{ flex: 1 }} />

        <MenuView
          onPressAction={({ nativeEvent }) => onSortChange(nativeEvent.event as SortBy)}
          actions={SORT_OPTIONS.map(o => ({
            // imageColor explicit for the same reason as the grid/list menu below —
            // the menu lib's new-arch bridge tints unset icons transparent.
            id: o.key, title: o.label, image: o.icon, imageColor: menuInk, state: sortBy === o.key ? 'on' : 'off',
          }))}
        >
          <View style={styles.filterToggle}>
            <Ionicons name="swap-vertical-outline" size={15} color={C.inkSoft} />
            <Text style={styles.filterToggleText}>
              {SORT_OPTIONS.find(o => o.key === sortBy)?.label}
            </Text>
          </View>
        </MenuView>
      </View>

      {/* Active filter chips — horizontally scrollable */}
      {activeCount > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: 8 }}
          contentContainerStyle={{ gap: 6, paddingHorizontal: 2 }}
        >
          {statusFilter !== 'all' && (
            <ActiveChip
              label={STATUS_FILTERS.find(f => f.key === statusFilter)?.label ?? statusFilter}
              onRemove={() => onStatusFilter('all')}
            />
          )}
          {regionFilters.map(r => (
            <ActiveChip key={r} label={r} onRemove={() => onRegionToggle(r)} />
          ))}
          {activityFilters.map(a => (
            <ActiveChip key={a} label={a} onRemove={() => onActivityToggle(a)} />
          ))}
          {topicFilters.map(t => (
            <ActiveChip key={t} label={t} onRemove={() => onTopicToggle(t)} />
          ))}
        </ScrollView>
      )}

      {/* Expanded panel — one accordion per filter category */}
      {renderPanel && (
        <Animated.View
          style={[
            styles.filterPanel,
            {
              opacity: panelAnim,
              transform: [{ translateY: panelAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }],
              // panelHeight is 0 until the first onLayout pass — on the very first
              // open there's nothing measured yet to animate toward, so skip the
              // height clamp entirely rather than growing from a 1px sliver.
              maxHeight: (settled || panelHeight === 0) ? undefined : panelAnim.interpolate({
                inputRange: [0, 1], outputRange: [0, panelHeight],
              }),
            },
          ]}
        >
        <View onLayout={e => setPanelHeight(e.nativeEvent.layout.height)}>
          {sections.map((s, i) => (
            <View key={s.key} style={i > 0 ? { borderTopWidth: 0.5, borderTopColor: C.hairlineSoft } : null}>
              <TouchableOpacity
                style={styles.filterSectionHeader}
                onPress={() => toggleSection(s.key)}
                activeOpacity={0.7}
              >
                <Text style={styles.filterSectionTitle}>{s.title.toUpperCase()}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.filterSectionSummary, s.hasSelection && { color: primary, fontWeight: '700' }]}>
                    {s.summary}
                  </Text>
                  <Ionicons
                    name={section === s.key ? 'chevron-up' : 'chevron-down'}
                    size={13} color={C.inkMute}
                  />
                </View>
              </TouchableOpacity>

              <Collapsible open={section === s.key}>
                <View style={styles.filterChipsWrap}>
                  {s.key === 'status' && STATUS_FILTERS.map(f => (
                    <Chip
                      key={f.key}
                      label={f.label}
                      dot={f.key !== 'all' ? f.color : undefined}
                      active={statusFilter === f.key}
                      onPress={() => onStatusFilter(f.key)}
                    />
                  ))}

                  {s.key === 'location' && (
                    <>
                      <Chip label="All regions" active={regionFilters.length === 0} onPress={onClearRegions} />
                      {REGIONS.map(r => (
                        <Chip key={r.label} label={r.label} active={regionFilters.includes(r.label)} onPress={() => onRegionToggle(r.label)} />
                      ))}
                    </>
                  )}

                  {(s.key === 'activities' || s.key === 'topics') && (
                    filtersLoading ? (
                      <Text style={styles.filterLoadingText}>Loading…</Text>
                    ) : (
                      <>
                        {(s.key === 'activities' ? allActivities : allTopics).map(item => (
                          <Chip
                            key={item}
                            label={item}
                            active={(s.key === 'activities' ? activityFilters : topicFilters).includes(item)}
                            onPress={() => (s.key === 'activities' ? onActivityToggle : onTopicToggle)(item)}
                          />
                        ))}
                        {(s.key === 'activities' ? activityFilters : topicFilters).length > 0 && (
                          <TouchableOpacity
                            onPress={s.key === 'activities' ? onClearActivities : onClearTopics}
                            activeOpacity={0.7}
                            style={styles.pillReset}
                          >
                            <Text style={[styles.pillResetText, { color: accent }]}>Clear</Text>
                          </TouchableOpacity>
                        )}
                      </>
                    )
                  )}
                </View>
              </Collapsible>
            </View>
          ))}
        </View>
        </Animated.View>
      )}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ParksScreen() {
  const { getToken } = useAuth();
  const { primary, accent } = useColors();
  const tabBarSpace = useTabBarSpace();
  // Menu icon tint — see the imageColor note on the view-toggle MenuView.
  const menuInk = useColorScheme() === 'dark' ? '#FFFBF1' : '#26231C';

  const [parks,   setParks]   = useState<Park[]>([]);
  const [visits,  setVisits]  = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);
  const [query,   setQuery]   = useState('');
  const [statusFilter,  setStatusFilter]  = useState<StatusFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('closest');
  // Same taxonomy/default as the map tab — National Parks only until opted
  // into more (see lib/parkTypes).
  const [enabledParkTypes, setEnabledParkTypes] = useState<Set<string>>(DEFAULT_PARK_TYPES);
  const [regionFilters, setRegionFilters] = useState<string[]>([]);
  const [activityFilters, setActivityFilters] = useState<string[]>([]);
  const [topicFilters,    setTopicFilters]    = useState<string[]>([]);
  const [activitiesMap, setActivitiesMap] = useState<Record<string, string[]>>({});
  const [topicsMap,     setTopicsMap]     = useState<Record<string, string[]>>({});
  const [filtersLoading, setFiltersLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showViewMenu, setShowViewMenu] = useState(false);
  const [offlineFetchedAt, setOfflineFetchedAt] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [showLocationPrompt, setShowLocationPrompt] = useState(false);
  const isOnline = useIsOnline();
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [viewMode]);

  const loadData = useCallback(async () => {
    const tok = await getToken();
    setError(false);
    const isFirstLoad = !hasLoadedRef.current;
    if (isFirstLoad) setLoading(true);

    // Paint whatever's already downloaded instantly instead of blocking on the
    // network — the live fetch below still runs and replaces it once it lands.
    let cache = isFirstLoad ? await loadOfflineParks() : null;
    if (cache) {
      setParks(cache.parks);
      setOfflineFetchedAt(isOnline && tok ? null : cache.fetchedAt);
      setLoading(false);
      hasLoadedRef.current = true;
    }

    // No token also covers Clerk still bootstrapping (e.g. offline at
    // startup) — fall back to cache same as being offline rather than hang.
    if (!isOnline || !tok) {
      if (!hasLoadedRef.current) {
        cache ??= await loadOfflineParks();
        if (cache) {
          setParks(cache.parks);
          setOfflineFetchedAt(cache.fetchedAt);
          hasLoadedRef.current = true;
        } else {
          setError(true);
        }
      }
    } else {
      try {
        const parksData = await fetch(`${BASE}/api/parks`).then(r => r.json()) as Park[];
        setParks(parksData);
        setOfflineFetchedAt(null);
        hasLoadedRef.current = true;
        saveOfflineParks(parksData); // silent background refresh of the offline cache
      } catch (e) {
        console.error('Parks load failed, falling back to offline cache:', e);
        cache ??= await loadOfflineParks();
        if (cache) {
          setParks(cache.parks);
          setOfflineFetchedAt(cache.fetchedAt);
          hasLoadedRef.current = true;
        } else if (!hasLoadedRef.current) {
          setError(true);
        }
      }
    }
    if (tok) {
      try {
        setVisits(await apiFetch<Visit[]>('/api/visits', tok));
      } catch (e) {
        console.error('Visits load failed:', e);
      }
    }
    setLoading(false);
  }, [getToken, isOnline]);

  const loadDataRef = useRef(loadData);
  loadDataRef.current = loadData;
  const flatListRef = useRef<FlatList>(null);
  useScrollToTop(flatListRef);

  const fetchLocation = useCallback(async () => {
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch { /* ignore — sort just falls back to alphabetical */ }
  }, []);

  const handleAllowLocation = useCallback(async () => {
    setShowLocationPrompt(false);
    await markLocationPromptSeen();
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') fetchLocation();
  }, [fetchLocation]);

  const handleDismissLocation = useCallback(async () => {
    setShowLocationPrompt(false);
    await markLocationPromptSeen();
  }, []);

  // Picking "Closest" without a location fix yet — re-surface the explainer
  // even if it was dismissed before, since the user is now explicitly asking
  // for location-based sorting.
  const handleSortChange = useCallback((s: SortBy) => {
    setSortBy(s);
    if (s !== 'closest' || userLocation) return;
    Location.getForegroundPermissionsAsync().then(({ status }) => {
      if (status === 'granted') fetchLocation();
      else setShowLocationPrompt(true);
    });
  }, [userLocation, fetchLocation]);

  useFocusEffect(useCallback(() => {
    loadDataRef.current();
    const intent = consumeParkFilterIntent();
    if (intent) setStatusFilter(intent);

    // Re-checked on every focus so a permission grant from Settings (or the
    // moderation screen's Location row) picks up without an app restart.
    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === 'granted') {
        fetchLocation();
        return;
      }
      if (status === 'denied') {
        await markLocationPromptSeen();
        return;
      }
      if (!(await hasSeenLocationPrompt())) setShowLocationPrompt(true);
    })();
  }, [fetchLocation]));

  // Activities and topics are slow (NPS API) — load lazily in background, once
  const filtersFetched = useRef(false);
  useFocusEffect(useCallback(() => {
    if (filtersFetched.current) return;
    filtersFetched.current = true;
    Promise.all([
      fetch(`${BASE}/api/parks/activities`).then(r => r.ok ? r.json() : {}),
      fetch(`${BASE}/api/parks/topics`).then(r => r.ok ? r.json() : {}),
    ]).then(([a, t]) => {
      setActivitiesMap(a);
      setTopicsMap(t);
      setFiltersLoading(false);
    }).catch(() => setFiltersLoading(false));
  }, []));

  const filtered = useMemo(() => {
    return parks.filter(p => {
      if (!PARK_TYPES.some(t => enabledParkTypes.has(t.key) && t.match(p))) return false;
      const status = parkStatus(p.park_code, visits);
      if (statusFilter !== 'all' && status !== statusFilter) return false;
      if (regionFilters.length > 0) {
        const parkStates = p.states.split(',').map(s => s.trim());
        const inAnyRegion = regionFilters.some(label => {
          const region = REGIONS.find(r => r.label === label);
          return !!region && parkStates.some(s => region.states.includes(s));
        });
        if (!inAnyRegion) return false;
      }
      if (activityFilters.length > 0) {
        const parkActivities = activitiesMap[p.park_code] ?? [];
        if (!activityFilters.every(a => parkActivities.includes(a))) return false;
      }
      if (topicFilters.length > 0) {
        const parkTopics = topicsMap[p.park_code] ?? [];
        if (!topicFilters.every(t => parkTopics.includes(t))) return false;
      }
      if (query) {
        const q = query.toLowerCase();
        return p.name.toLowerCase().includes(q)
          || p.states.toLowerCase().includes(q)
          // Full names too — "Utah" should match states: "UT", same as the
          // search overlay does.
          || fullStateName(p.states).toLowerCase().includes(q)
          || (p.description ?? '').toLowerCase().includes(q);
      }
      return true;
    }).sort((a, b) => {
      if (sortBy === 'za') return b.name.localeCompare(a.name);
      if (sortBy === 'closest' && userLocation) {
        const da = a.latitude && a.longitude
          ? distanceMiles(userLocation.lat, userLocation.lng, parseFloat(a.latitude), parseFloat(a.longitude))
          : Infinity;
        const db = b.latitude && b.longitude
          ? distanceMiles(userLocation.lat, userLocation.lng, parseFloat(b.latitude), parseFloat(b.longitude))
          : Infinity;
        if (da !== db) return da - db;
      }
      // 'az', or 'closest' without a location fix yet
      return a.name.localeCompare(b.name);
    });
  }, [parks, visits, query, statusFilter, regionFilters, activityFilters, topicFilters, activitiesMap, topicsMap, userLocation, sortBy, enabledParkTypes]);

  const parkTypeCounts: Record<string, number> = useMemo(
    () => Object.fromEntries(PARK_TYPES.map(t => [t.key, parks.filter(t.match).length])),
    [parks]
  );

  const hasFilter = statusFilter !== 'all' || regionFilters.length > 0
    || activityFilters.length > 0 || topicFilters.length > 0;

  const handleReset = useCallback(() => {
    setStatusFilter('all');
    setRegionFilters([]);
    setActivityFilters([]);
    setTopicFilters([]);
  }, []);

  // Most common activities / topics across all parks (same ranking as web)
  const allActivities = useMemo(() => {
    const freq: Record<string, number> = {};
    parks.forEach(p => {
      (activitiesMap[p.park_code] ?? []).forEach(a => { freq[a] = (freq[a] ?? 0) + 1; });
    });
    const top = Object.entries(freq)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name]) => name)
      .slice(0, 24);
    const extras = activityFilters.filter(a => !top.includes(a));
    return [...extras, ...top];
  }, [parks, activitiesMap, activityFilters]);

  const allTopics = useMemo(() => {
    const freq: Record<string, number> = {};
    parks.forEach(p => {
      (topicsMap[p.park_code] ?? []).forEach(t => { freq[t] = (freq[t] ?? 0) + 1; });
    });
    const top = Object.entries(freq)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name]) => name)
      .slice(0, 30);
    const extras = topicFilters.filter(t => !top.includes(t));
    return [...extras, ...top];
  }, [parks, topicsMap, topicFilters]);

  type ParkRow =
    | { id: string; type: 'skeleton' }
    | { id: string; type: 'pair'; left: Park; right: Park | null }
    | { id: string; type: 'single'; park: Park };

  const rows = useMemo((): ParkRow[] => {
    if (loading) return Array.from({ length: 12 }, (_, i) => ({ id: `sk-${i}`, type: 'skeleton' as const }));
    if (viewMode === 'list') {
      return filtered.map(p => ({ id: p.park_code, type: 'single' as const, park: p }));
    }
    const out: ParkRow[] = [];
    for (let i = 0; i < filtered.length; i += 2) {
      out.push({ id: filtered[i].park_code, type: 'pair', left: filtered[i], right: filtered[i + 1] ?? null });
    }
    return out;
  }, [filtered, loading, viewMode]);

  const ListHeader = (
    <View>
      {offlineFetchedAt && <OfflineBanner fetchedAt={offlineFetchedAt} />}

      {/* Page header */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={styles.title}>Explore the Parks</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <MenuView
              onOpenMenu={() => setShowViewMenu(true)}
              onCloseMenu={() => setShowViewMenu(false)}
              onPressAction={({ nativeEvent }) => setViewMode(nativeEvent.event as 'grid' | 'list')}
              actions={[
                // Explicit imageColor: the menu lib's new-arch bridge tints
                // unset icons with color 0 (transparent) — see parks/[id].
                { id: 'grid', title: 'Grid', image: 'square.grid.2x2', imageColor: menuInk, state: viewMode === 'grid' ? 'on' : 'off' },
                { id: 'list', title: 'List', image: 'list.bullet', imageColor: menuInk, state: viewMode === 'list' ? 'on' : 'off' },
              ]}
            >
              <TouchableOpacity
                hitSlop={8}
                activeOpacity={0.7}
                style={[styles.viewToggle, showViewMenu && { backgroundColor: primary + '14', borderColor: primary }]}
              >
                <GlassIconBg />
                <Ionicons
                  name={viewMode === 'grid' ? 'grid-outline' : 'list-outline'}
                  size={22}
                  color={showViewMenu ? primary : C.inkSoft}
                />
              </TouchableOpacity>
            </MenuView>
          </View>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={15} color={C.inkMute} />
        <TextInput
          value={query} onChangeText={setQuery}
          placeholder="Search parks…" placeholderTextColor={C.inkMute}
          style={styles.searchInput} autoCorrect={false} autoCapitalize="none" spellCheck={false}
          returnKeyType="search" onSubmitEditing={Keyboard.dismiss}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={C.inkMute} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filters */}
      <FilterPanel
        statusFilter={statusFilter} onStatusFilter={setStatusFilter}
        regionFilters={regionFilters}
        onRegionToggle={r => setRegionFilters(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r])}
        onClearRegions={() => setRegionFilters([])}
        activityFilters={activityFilters}
        onActivityToggle={a => setActivityFilters(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a])}
        onClearActivities={() => setActivityFilters([])}
        topicFilters={topicFilters}
        onTopicToggle={t => setTopicFilters(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])}
        onClearTopics={() => setTopicFilters([])}
        allActivities={allActivities} allTopics={allTopics}
        filtersLoading={filtersLoading}
        hasFilter={hasFilter} onReset={handleReset}
        sortBy={sortBy} onSortChange={handleSortChange}
        enabledParkTypes={enabledParkTypes}
        parkTypeCounts={parkTypeCounts}
        onToggleParkType={key => setEnabledParkTypes(prev => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key); else next.add(key);
          return next;
        })}
      />

      {/* Results count */}
      {(hasFilter || !!query) && !loading && (
        <Text style={styles.resultsCount}>{filtered.length} RESULT{filtered.length !== 1 ? 'S' : ''}</Text>
      )}
    </View>
  );

  const ListEmpty = !loading ? (
    <View style={styles.emptyWrap}>
      <Text style={{ fontSize: 36, marginBottom: 12 }}>🏔</Text>
      <Text style={{ fontWeight: '700', fontSize: 16, color: C.ink, marginBottom: 4 }}>No parks found</Text>
      <Text style={{ fontSize: 13, color: C.inkMute, textAlign: 'center' }}>Try adjusting your search or filters.</Text>
    </View>
  ) : null;

  const ListFooter = !loading && filtered.length > 0 ? (
    <View style={{ paddingHorizontal: H_PAD, paddingTop: 24, paddingBottom: 40, borderTopWidth: 0.5, borderTopColor: C.hairline, marginHorizontal: H_PAD, marginTop: 16 }}>
      <Text style={{ fontSize: 13, color: C.inkMute, lineHeight: 17 }}>
        Park information is sourced directly from the{" "}
        <Text style={{ textDecorationLine: 'underline' }} onPress={() => Linking.openURL('https://www.nps.gov')}>
          National Park Service (NPS)
        </Text>
        . Weather forecasts are provided by the{" "}
        <Text style={{ textDecorationLine: 'underline' }} onPress={() => Linking.openURL('https://www.weather.gov')}>
          National Weather Service (NWS)
        </Text>
        . ParkQuest does not guarantee the accuracy, completeness, or timeliness of any information displayed. Always verify details before your visit.
      </Text>
    </View>
  ) : null;

  if (error) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <Ionicons name="cloud-offline-outline" size={36} color={C.inkMute} />
          <Text style={{ color: C.inkMute, fontSize: 15, fontWeight: '600' }}>Failed to load parks</Text>
          <TouchableOpacity
            onPress={() => loadData()}
            style={{ paddingHorizontal: 20, paddingVertical: 10, backgroundColor: primary, borderRadius: 12 }}
          >
            <Text style={{ color: C.onPrimary, fontWeight: '700', fontSize: 14 }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <LocationPermissionModal
        visible={showLocationPrompt}
        onAllow={handleAllowLocation}
        onDismiss={handleDismissLocation}
      />
      <FlatList
        ref={flatListRef}
        data={rows}
        keyExtractor={item => item.id}
        renderItem={({ item, index }) => {
          if (item.type === 'skeleton') {
            return (
              <View style={styles.rowWrap}>
                <SkeletonCard />
                <SkeletonCard />
              </View>
            );
          }
          const distLoc = sortBy === 'closest' ? userLocation : null;
          if (item.type === 'single') {
            const s = parkStatus(item.park.park_code, visits);
            const vc = visits.filter(v => v.park_code === item.park.park_code && !v.is_bucket_list && v.visited_date).length;
            return <ParkListRow park={item.park} status={s} visitCount={vc} distance={parkDistance(item.park, distLoc)} priority={imagePriority(index)} />;
          }
          return <ParkCardRow left={item.left} right={item.right} visits={visits} userLocation={distLoc} startIndex={index * 2} />;
        }}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
        ListFooterComponent={ListFooter}
        contentContainerStyle={{ paddingBottom: tabBarSpace + 8 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        removeClippedSubviews
        windowSize={7}
        maxToRenderPerBatch={8}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bg,
  },
  header: {
    paddingHorizontal: H_PAD,
    paddingTop: 20,
    paddingBottom: 14,
  },
  title: {
    fontSize: 30,
    fontWeight: '900',
    color: C.ink,
    letterSpacing: -0.8,
  },
  // Search
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: H_PAD,
    marginBottom: 12,
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 10,
    borderWidth: 0.5,
    borderColor: C.hairline,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: C.ink,
    padding: 0,
  },

  // Filter pills
  filterWrap: {
    paddingHorizontal: H_PAD,
    paddingBottom: 12,
  },
  filterToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 100,
    backgroundColor: C.surface,
    borderWidth: 0.5,
    borderColor: C.hairline,
  },
  filterToggleActive: {},
  filterToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.inkSoft,
  },
  filterBadge: {
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: {
    fontSize: 13,
    fontWeight: '800',
  },
  filterPanel: {
    marginTop: 8,
    backgroundColor: C.surface,
    borderWidth: 0.5,
    borderColor: C.hairline,
    borderRadius: 14,
    overflow: 'hidden',
  },
  filterSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  filterSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: C.inkMute,
    letterSpacing: 1,
  },
  filterSectionSummary: {
    fontSize: 13,
    fontWeight: '500',
    color: C.inkMute,
  },
  filterChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 14,
    paddingBottom: 14,
    alignItems: 'center',
  },
  filterLoadingText: {
    fontSize: 13,
    color: C.inkMute,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
    backgroundColor: C.surface,
    borderWidth: 0.5,
    borderColor: C.hairline,
  },
  pillActive: {},
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '500',
    color: C.ink,
  },
  pillTextActive: {
    color: C.onPrimary,
    fontWeight: '600',
  },
  pillReset: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pillResetText: {
    fontSize: 13,
    fontWeight: '600',
  },

  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 0.5,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  activeChipText: {
    fontSize: 13,
    fontWeight: '600',
    maxWidth: 160,
  },

  resultsCount: {
    paddingHorizontal: H_PAD,
    marginBottom: 10,
    fontSize: 13,
    fontWeight: '600',
    color: C.inkMute,
    letterSpacing: 1.2,
  },

  // View toggle button — 44pt, the app-wide round icon button size (matches
  // the park page header buttons).
  viewToggle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: C.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Grid rows
  rowWrap: {
    flexDirection: 'row',
    gap: CARD_GAP,
    paddingHorizontal: H_PAD,
    marginBottom: CARD_GAP,
  },

  // List row
  listCard: {
    backgroundColor: C.surface,
    borderRadius: 20,
    borderCurve: 'continuous',
    borderWidth: 0.5,
    borderColor: C.hairline,
    overflow: 'hidden',
    marginHorizontal: H_PAD,
    marginBottom: CARD_GAP,
  },
  listCardImg: {
    height: 120,
    position: 'relative',
  },

  // Card
  card: {
    backgroundColor: C.surface,
    borderRadius: 20,
    borderCurve: 'continuous',
    borderWidth: 0.5,
    borderColor: C.hairline,
    overflow: 'hidden',
  },
  cardImg: {
    height: 120,
    position: 'relative',
  },
  cardImgOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.14)',
  },
  cardState: {
    fontSize: 11,
    fontWeight: '600',
    color: C.inkMute,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  cardName: {
    fontSize: 16,
    fontWeight: '800',
    color: C.ink,
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  cardDesc: {
    fontSize: 13,
    color: C.inkMute,
    lineHeight: 17,
    marginTop: 6,
  },

  // Status badge
  statusBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },

  // Empty state
  emptyWrap: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: H_PAD,
  },
});
