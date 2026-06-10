import {
  Dimensions, FlatList, Image, Linking, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useCallback, useMemo, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { fullStateName } from '@/lib/stateNames';

// ── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  bg:         '#F2EBDB',
  surface:    '#FFFBF1',
  surfaceAlt: '#F7F0DE',
  ink:        '#1B1A16',
  inkSoft:    '#3C3A33',
  inkMute:    '#7A746A',
  hairline:   'rgba(27,26,22,0.10)',
  hairlineSoft:'rgba(27,26,22,0.06)',
  primary:    '#1F3D2E',
  accent:     '#C56B3D',
  visited:    '#2F7A4A',
  bucket:     '#C48A20',
};

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
console.log('[parks] BASE URL:', BASE);
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
}

interface Visit {
  park_code: string;
  is_bucket_list: boolean;
  visited_date: string | null;
}

type ParkStatus = 'visited' | 'bucketList' | 'notVisited';
type StatusFilter = 'all' | 'visited' | 'bucketList' | 'notVisited';

// ── Constants ─────────────────────────────────────────────────────────────────

const GRADIENTS = [
  ['#1F3D2E', '#2F7A4A'],
  ['#2D4F66', '#1F3D2E'],
  ['#7B3A1F', '#C56B3D'],
  ['#3A2E5C', '#6E97A3'],
  ['#2F7A4A', '#2D4F66'],
];

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

const STATUS_FILTERS: Array<{ key: StatusFilter; label: string; color: string }> = [
  { key: 'all',        label: 'All',         color: C.ink },
  { key: 'visited',    label: 'Visited',     color: C.visited },
  { key: 'bucketList', label: 'Bucket list', color: C.bucket },
  { key: 'notVisited', label: 'To explore',  color: C.inkMute },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function gradientColors(code: string): [string, string] {
  const idx = code.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % GRADIENTS.length;
  return [GRADIENTS[idx][0], GRADIENTS[idx][1]];
}

function parkStatus(code: string, visits: Visit[]): ParkStatus {
  const pv = visits.filter(v => v.park_code === code);
  if (pv.some(v => !v.is_bucket_list && v.visited_date)) return 'visited';
  if (pv.some(v => v.is_bucket_list)) return 'bucketList';
  return 'notVisited';
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
  if (status === 'notVisited') {
    return (
      <View style={[styles.statusBadge, { backgroundColor: 'rgba(20,17,12,0.52)' }]}>
        <Ionicons name="add" size={9} color="#FFFBF1" />
        <Text style={styles.statusBadgeText}>Not visited</Text>
      </View>
    );
  }
  return (
    <View style={[styles.statusBadge, {
      backgroundColor: status === 'visited' ? C.visited : C.bucket,
    }]}>
      <Ionicons
        name={status === 'visited' ? 'checkmark' : 'bookmark'}
        size={9} color="#FFFBF1"
      />
      <Text style={styles.statusBadgeText}>
        {status === 'visited' ? 'Visited' : 'Bucket list'}
      </Text>
    </View>
  );
}

// ── Park card ─────────────────────────────────────────────────────────────────

function ParkCard({ park, status }: { park: Park; status: ParkStatus }) {
  const router = useRouter();
  const [imgFailed, setImgFailed] = useState(false);
  const [g1] = gradientColors(park.park_code);
  const stateCode = park.states.split(',')[0].trim();
  const stateName = fullStateName(stateCode);

  return (
    <TouchableOpacity
      onPress={() => router.push(`/parks/${park.park_code}` as never)}
      style={[styles.card, { width: CARD_W }]}
      activeOpacity={0.85}
    >
      <View style={[styles.cardImg, { backgroundColor: g1 }]}>
        {park.image_url && !imgFailed && (
          <Image
            source={{ uri: park.image_url }}
            style={StyleSheet.absoluteFill as any}
            resizeMode="cover"
            onError={() => setImgFailed(true)}
          />
        )}
        <View style={styles.cardImgOverlay} />
        <StatusBadge status={status} />
      </View>
      <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14 }}>
        <Text style={styles.cardState} numberOfLines={1}>{stateName}</Text>
        <Text style={styles.cardName} numberOfLines={2}>{park.name}</Text>
        {park.description ? (
          <Text style={styles.cardDesc} numberOfLines={2}>{park.description}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

// ── Filter panel ──────────────────────────────────────────────────────────────

type FilterSection = 'status' | 'location' | 'activities' | 'topics';

function Chip({
  label, active, dot, onPress,
}: { label: string; active: boolean; dot?: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress} activeOpacity={0.7}
      style={[styles.pill, active && styles.pillActive]}
    >
      {dot ? <View style={[styles.pillDot, { backgroundColor: dot }]} /> : null}
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function FilterPanel({
  statusFilter, onStatusFilter,
  regionFilter, onRegionFilter,
  activityFilters, onActivityToggle, onClearActivities,
  topicFilters, onTopicToggle, onClearTopics,
  allActivities, allTopics, filtersLoading,
  hasFilter, onReset,
}: {
  statusFilter: StatusFilter; onStatusFilter: (s: StatusFilter) => void;
  regionFilter: string; onRegionFilter: (r: string) => void;
  activityFilters: string[]; onActivityToggle: (a: string) => void; onClearActivities: () => void;
  topicFilters: string[]; onTopicToggle: (t: string) => void; onClearTopics: () => void;
  allActivities: string[]; allTopics: string[]; filtersLoading: boolean;
  hasFilter: boolean; onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<FilterSection | null>(null);

  const activeCount =
    (statusFilter !== 'all' ? 1 : 0) +
    (regionFilter !== 'all' ? 1 : 0) +
    activityFilters.length +
    topicFilters.length;

  const toggleSection = (s: FilterSection) =>
    setSection(prev => (prev === s ? null : s));

  const statusLabel = STATUS_FILTERS.find(f => f.key === statusFilter)?.label ?? 'All';

  const sections: Array<{
    key: FilterSection;
    title: string;
    summary: string;
    hasSelection: boolean;
  }> = [
    { key: 'status',     title: 'Status',     summary: statusLabel, hasSelection: statusFilter !== 'all' },
    { key: 'location',   title: 'Location',   summary: regionFilter === 'all' ? 'All regions' : regionFilter, hasSelection: regionFilter !== 'all' },
    { key: 'activities', title: 'Activities', summary: activityFilters.length > 0 ? `${activityFilters.length} selected` : 'Any', hasSelection: activityFilters.length > 0 },
    { key: 'topics',     title: 'Topics',     summary: topicFilters.length > 0 ? `${topicFilters.length} selected` : 'Any', hasSelection: topicFilters.length > 0 },
  ];

  return (
    <View style={styles.filterWrap}>
      {/* Toggle row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TouchableOpacity
          style={[styles.filterToggle, (open || activeCount > 0) && styles.filterToggleActive]}
          onPress={() => { setOpen(o => !o); if (open) setSection(null); }}
          activeOpacity={0.75}
        >
          <Ionicons
            name="options-outline" size={15}
            color={open || activeCount > 0 ? '#FFFBF1' : C.inkSoft}
          />
          <Text style={[styles.filterToggleText, (open || activeCount > 0) && { color: '#FFFBF1' }]}>
            Filters
          </Text>
          {activeCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeCount}</Text>
            </View>
          )}
          <Ionicons
            name={open ? 'chevron-up' : 'chevron-down'} size={13}
            color={open || activeCount > 0 ? '#FFFBF1' : C.inkMute}
          />
        </TouchableOpacity>

        {hasFilter && (
          <TouchableOpacity onPress={onReset} activeOpacity={0.7} style={styles.pillReset}>
            <Ionicons name="close-circle" size={14} color={C.accent} />
            <Text style={styles.pillResetText}>Reset</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Expanded panel — one accordion per filter category */}
      {open && (
        <View style={styles.filterPanel}>
          {sections.map((s, i) => (
            <View key={s.key} style={i > 0 ? { borderTopWidth: 0.5, borderTopColor: C.hairlineSoft } : null}>
              <TouchableOpacity
                style={styles.filterSectionHeader}
                onPress={() => toggleSection(s.key)}
                activeOpacity={0.7}
              >
                <Text style={styles.filterSectionTitle}>{s.title.toUpperCase()}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.filterSectionSummary, s.hasSelection && { color: C.primary, fontWeight: '700' }]}>
                    {s.summary}
                  </Text>
                  <Ionicons
                    name={section === s.key ? 'chevron-up' : 'chevron-down'}
                    size={13} color={C.inkMute}
                  />
                </View>
              </TouchableOpacity>

              {section === s.key && (
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
                      <Chip label="All regions" active={regionFilter === 'all'} onPress={() => onRegionFilter('all')} />
                      {REGIONS.map(r => (
                        <Chip key={r.label} label={r.label} active={regionFilter === r.label} onPress={() => onRegionFilter(r.label)} />
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
                            <Text style={styles.pillResetText}>Clear</Text>
                          </TouchableOpacity>
                        )}
                      </>
                    )
                  )}
                </View>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ParksScreen() {
  const { getToken } = useAuth();

  const [parks,   setParks]   = useState<Park[]>([]);
  const [visits,  setVisits]  = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);
  const [query,   setQuery]   = useState('');
  const [statusFilter,  setStatusFilter]  = useState<StatusFilter>('all');
  const [regionFilter,  setRegionFilter]  = useState('all');
  const [activityFilters, setActivityFilters] = useState<string[]>([]);
  const [topicFilters,    setTopicFilters]    = useState<string[]>([]);
  const [activitiesMap, setActivitiesMap] = useState<Record<string, string[]>>({});
  const [topicsMap,     setTopicsMap]     = useState<Record<string, string[]>>({});
  const [filtersLoading, setFiltersLoading] = useState(true);

  const loadData = useCallback(async () => {
    const tok = await getToken();
    if (!tok) return;
    setParks(prev => { if (prev.length === 0) setLoading(true); return prev; });
    setError(false);
    try {
      const [parksData, visitsData] = await Promise.all([
        fetch(`${BASE}/api/parks`).then(r => r.json()) as Promise<Park[]>,
        apiFetch<Visit[]>('/api/visits', tok),
      ]);
      setParks(parksData);
      setVisits(visitsData);
    } catch (e) {
      console.error('Parks load failed:', e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  const loadDataRef = useRef(loadData);
  loadDataRef.current = loadData;
  useFocusEffect(useCallback(() => { loadDataRef.current(); }, []));

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

  const visitedCount = useMemo(
    () => parks.filter(p => parkStatus(p.park_code, visits) === 'visited').length,
    [parks, visits]
  );

  const filtered = useMemo(() => {
    return parks.filter(p => {
      const status = parkStatus(p.park_code, visits);
      if (statusFilter !== 'all' && status !== statusFilter) return false;
      if (regionFilter !== 'all') {
        const region = REGIONS.find(r => r.label === regionFilter);
        const parkStates = p.states.split(',').map(s => s.trim());
        if (!region || !parkStates.some(s => region.states.includes(s))) return false;
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
          || (p.description ?? '').toLowerCase().includes(q);
      }
      return true;
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [parks, visits, query, statusFilter, regionFilter, activityFilters, topicFilters, activitiesMap, topicsMap]);

  const hasFilter = !!query || statusFilter !== 'all' || regionFilter !== 'all'
    || activityFilters.length > 0 || topicFilters.length > 0;

  const handleReset = useCallback(() => {
    setQuery('');
    setStatusFilter('all');
    setRegionFilter('all');
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
    | { id: string; type: 'pair'; left: Park; right: Park | null };

  // Pair items for 2-col grid
  const rows = useMemo((): ParkRow[] => {
    if (loading) return Array.from({ length: 12 }, (_, i) => ({ id: `sk-${i}`, type: 'skeleton' as const }));
    const out: ParkRow[] = [];
    for (let i = 0; i < filtered.length; i += 2) {
      out.push({ id: filtered[i].park_code, type: 'pair', left: filtered[i], right: filtered[i + 1] ?? null });
    }
    return out;
  }, [filtered, loading]);

  const ListHeader = (
    <View>
      {/* Page header */}
      <View style={styles.header}>
        <Text style={styles.kicker}>{loading ? 'NATIONAL PARKS' : `${parks.length} NATIONAL PARKS`}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Text style={styles.title}>Explore the Parks</Text>
          {!loading && (
            <Text style={styles.counter}>{visitedCount} / {parks.length} visited</Text>
          )}
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={15} color={C.inkMute} />
        <TextInput
          value={query} onChangeText={setQuery}
          placeholder="Search parks…" placeholderTextColor={C.inkMute}
          style={styles.searchInput} autoCorrect={false} autoCapitalize="none"
          clearButtonMode="while-editing"
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
        regionFilter={regionFilter} onRegionFilter={setRegionFilter}
        activityFilters={activityFilters}
        onActivityToggle={a => setActivityFilters(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a])}
        onClearActivities={() => setActivityFilters([])}
        topicFilters={topicFilters}
        onTopicToggle={t => setTopicFilters(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])}
        onClearTopics={() => setTopicFilters([])}
        allActivities={allActivities} allTopics={allTopics}
        filtersLoading={filtersLoading}
        hasFilter={hasFilter} onReset={handleReset}
      />

      {/* Results count */}
      {hasFilter && !loading && (
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
      <Text style={{ fontSize: 11, color: C.inkMute, lineHeight: 17 }}>
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
            style={{ paddingHorizontal: 20, paddingVertical: 10, backgroundColor: C.primary, borderRadius: 12 }}
          >
            <Text style={{ color: '#FFFBF1', fontWeight: '700', fontSize: 14 }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <FlatList
        data={rows}
        keyExtractor={item => item.id}
        renderItem={({ item }) => {
          if (item.type === 'skeleton') {
            return (
              <View style={styles.rowWrap}>
                <SkeletonCard />
                <SkeletonCard />
              </View>
            );
          }
          return (
            <View style={styles.rowWrap}>
              <ParkCard park={item.left} status={parkStatus(item.left.park_code, visits)} />
              {item.right
                ? <ParkCard park={item.right} status={parkStatus(item.right.park_code, visits)} />
                : <View style={{ width: CARD_W }} />
              }
            </View>
          );
        }}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
        ListFooterComponent={ListFooter}
        contentContainerStyle={{ paddingBottom: 20 }}
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
  kicker: {
    fontSize: 9.5,
    fontWeight: '600',
    color: C.inkMute,
    letterSpacing: 1.4,
    marginBottom: 3,
  },
  title: {
    fontSize: 30,
    fontWeight: '900',
    color: C.ink,
    letterSpacing: -0.8,
  },
  counter: {
    fontSize: 11,
    fontWeight: '600',
    color: C.inkMute,
    letterSpacing: 0.3,
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
  filterToggleActive: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  filterToggleText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: C.inkSoft,
  },
  filterBadge: {
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: '#FFFBF1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: C.primary,
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
    fontSize: 10,
    fontWeight: '700',
    color: C.inkMute,
    letterSpacing: 1,
  },
  filterSectionSummary: {
    fontSize: 12,
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
    fontSize: 12,
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
  pillActive: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '500',
    color: C.ink,
  },
  pillTextActive: {
    color: '#FFFBF1',
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
    fontSize: 12,
    fontWeight: '600',
    color: C.accent,
  },

  resultsCount: {
    paddingHorizontal: H_PAD,
    marginBottom: 10,
    fontSize: 9.5,
    fontWeight: '600',
    color: C.inkMute,
    letterSpacing: 1.2,
  },

  // Grid rows
  rowWrap: {
    flexDirection: 'row',
    gap: CARD_GAP,
    paddingHorizontal: H_PAD,
    marginBottom: CARD_GAP,
  },

  // Card
  card: {
    backgroundColor: C.surface,
    borderRadius: 14,
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
    fontSize: 9,
    fontWeight: '700',
    color: C.inkMute,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  cardName: {
    fontSize: 14,
    fontWeight: '800',
    color: C.ink,
    lineHeight: 17,
    letterSpacing: -0.2,
  },
  cardDesc: {
    fontSize: 11.5,
    color: C.inkMute,
    lineHeight: 17,
    marginTop: 6,
  },

  // Status badge
  statusBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFBF1',
    letterSpacing: 0.3,
  },

  // Empty state
  emptyWrap: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: H_PAD,
  },
});
