import {
  Dimensions, FlatList, Image, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
const CARD_GAP = 10;
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
      <View style={{ padding: 10, gap: 6 }}>
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
      <View style={{ padding: 10 }}>
        <Text style={styles.cardState} numberOfLines={1}>{stateName}</Text>
        <Text style={styles.cardName} numberOfLines={2}>{park.name}</Text>
        {park.description ? (
          <Text style={styles.cardDesc} numberOfLines={2}>{park.description}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

// ── Filter pills ──────────────────────────────────────────────────────────────

function FilterRow({
  statusFilter, onStatusFilter,
  regionFilter, onRegionFilter,
  hasFilter, onReset,
  visitedCount, parks,
}: {
  statusFilter: StatusFilter; onStatusFilter: (s: StatusFilter) => void;
  regionFilter: string; onRegionFilter: (r: string) => void;
  hasFilter: boolean; onReset: () => void;
  visitedCount: number; parks: Park[];
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.filterRow}
      keyboardShouldPersistTaps="handled"
    >
      {/* Status pills */}
      {STATUS_FILTERS.map(f => {
        const on = statusFilter === f.key;
        return (
          <TouchableOpacity
            key={f.key} onPress={() => onStatusFilter(f.key)} activeOpacity={0.7}
            style={[styles.pill, on && styles.pillActive]}
          >
            {f.key !== 'all' && (
              <View style={[styles.pillDot, { backgroundColor: f.color }]} />
            )}
            <Text style={[styles.pillText, on && styles.pillTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        );
      })}

      {/* Divider */}
      <View style={styles.pillDivider} />

      {/* Region pills */}
      <TouchableOpacity
        onPress={() => onRegionFilter('all')} activeOpacity={0.7}
        style={[styles.pill, regionFilter === 'all' && styles.pillActive]}
      >
        <Text style={[styles.pillText, regionFilter === 'all' && styles.pillTextActive]}>All regions</Text>
      </TouchableOpacity>
      {REGIONS.map(r => {
        const on = regionFilter === r.label;
        return (
          <TouchableOpacity
            key={r.label} onPress={() => onRegionFilter(r.label)} activeOpacity={0.7}
            style={[styles.pill, on && styles.pillActive]}
          >
            <Text style={[styles.pillText, on && styles.pillTextActive]}>{r.label}</Text>
          </TouchableOpacity>
        );
      })}

      {/* Reset */}
      {hasFilter && (
        <>
          <View style={styles.pillDivider} />
          <TouchableOpacity onPress={onReset} activeOpacity={0.7} style={styles.pillReset}>
            <Ionicons name="close-circle" size={14} color={C.accent} />
            <Text style={styles.pillResetText}>Reset</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ParksScreen() {
  const { getToken } = useAuth();

  const [parks,   setParks]   = useState<Park[]>([]);
  const [visits,  setVisits]  = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [query,   setQuery]   = useState('');
  const [statusFilter,  setStatusFilter]  = useState<StatusFilter>('all');
  const [regionFilter,  setRegionFilter]  = useState('all');

  const loadData = useCallback(async () => {
    const tok = await getToken();
    if (!tok) return;
    setLoading(true);
    try {
      const [parksData, visitsData] = await Promise.all([
        apiFetch<Park[]>('/api/parks', tok),
        apiFetch<Visit[]>('/api/visits', tok),
      ]);
      setParks(parksData);
      setVisits(visitsData);
    } catch (e) {
      console.error('Parks load failed:', e);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { loadData(); }, [loadData]);
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

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
      if (query) {
        const q = query.toLowerCase();
        return p.name.toLowerCase().includes(q)
          || p.states.toLowerCase().includes(q)
          || (p.description ?? '').toLowerCase().includes(q);
      }
      return true;
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [parks, visits, query, statusFilter, regionFilter]);

  const hasFilter = !!query || statusFilter !== 'all' || regionFilter !== 'all';

  const handleReset = useCallback(() => {
    setQuery('');
    setStatusFilter('all');
    setRegionFilter('all');
  }, []);

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
        <Text style={styles.kicker}>NATIONAL PARKS</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Text style={styles.title}>Explore the Parks</Text>
          {!loading && (
            <Text style={styles.counter}>{visitedCount} / {parks.length}</Text>
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

      {/* Filter pills */}
      <FilterRow
        statusFilter={statusFilter} onStatusFilter={setStatusFilter}
        regionFilter={regionFilter} onRegionFilter={setRegionFilter}
        hasFilter={hasFilter} onReset={handleReset}
        visitedCount={visitedCount} parks={parks}
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
        Park information sourced from the National Park Service (NPS). Always verify details before your visit.
      </Text>
    </View>
  ) : null;

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
    fontSize: 26,
    fontWeight: '900',
    color: C.ink,
    letterSpacing: -0.6,
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
  filterRow: {
    paddingHorizontal: H_PAD,
    paddingBottom: 12,
    gap: 6,
    flexDirection: 'row',
    alignItems: 'center',
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
  pillDivider: {
    width: 1,
    height: 18,
    backgroundColor: C.hairline,
    marginHorizontal: 2,
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
    height: 110,
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
    marginBottom: 3,
  },
  cardName: {
    fontSize: 13.5,
    fontWeight: '800',
    color: C.ink,
    lineHeight: 17,
    letterSpacing: -0.2,
  },
  cardDesc: {
    fontSize: 11,
    color: C.inkMute,
    lineHeight: 15,
    marginTop: 4,
  },

  // Status badge
  statusBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 100,
  },
  statusBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#FFFBF1',
    letterSpacing: 0.2,
  },

  // Empty state
  emptyWrap: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: H_PAD,
  },
});
