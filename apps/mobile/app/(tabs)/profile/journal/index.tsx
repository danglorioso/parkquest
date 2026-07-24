import {
  FlatList, Modal, Platform, Pressable, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Image } from 'expo-image';
import { useCallback, useMemo, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { useTabBarSpace } from '@/components/FloatingTabBar';
import { STATIC as C, useColors } from '@/lib/palette';
import { dayCount, fmtDate, fmtRange } from '@/lib/dates';
import { parkColor } from '@/lib/parkColors';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface JournalEntry {
  id: number;
  park_code: string;
  park_name: string | null;
  states: string | null;
  visited_date: string | null;
  end_date: string | null;
  is_bucket_list: boolean;
  rating: number | null;
  crowd: number | null;
  difficulty: number | null;
  weather_conditions: string[] | null;
  activities: string[] | null;
  companions: string[] | null;
  would_return: string | null;
  highlight: string | null;
  title: string | null;
  notes: string | null;
  photos: string[] | null;
  cover_photo: string | null;
  visibility: string | null;
  created_at: string | null;
}

// ── Stars ─────────────────────────────────────────────────────────────────────

function Stars({ value, size = 11 }: { value: number; size?: number }) {
  const T = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 1 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Ionicons key={i} name={i < Math.round(value) ? 'star' : 'star-outline'} size={size} color={T.accent} />
      ))}
      <Text style={{ fontSize: Math.max(13, size - 2), fontWeight: '600', color: C.inkMute, marginLeft: 4 }}>
        {value}/5
      </Text>
    </View>
  );
}

// ── Skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <View style={[styles.card, { overflow: 'hidden' }]}>
      <View style={{ width: 80, backgroundColor: C.surfaceAlt }} />
      <View style={{ flex: 1, padding: 12, gap: 8 }}>
        <View style={{ height: 9, width: '50%', backgroundColor: C.surfaceAlt, borderRadius: 4 }} />
        <View style={{ height: 14, width: '80%', backgroundColor: C.surfaceAlt, borderRadius: 4 }} />
        <View style={{ height: 11, width: '60%', backgroundColor: C.surfaceAlt, borderRadius: 4 }} />
        <View style={{ height: 11, width: '40%', backgroundColor: C.surfaceAlt, borderRadius: 4 }} />
      </View>
    </View>
  );
}

// ── Entry card ────────────────────────────────────────────────────────────────

function EntryCard({ entry, onPress }: { entry: JournalEntry; onPress: () => void }) {
  const T = useColors();
  const cover  = entry.cover_photo ?? entry.photos?.[0] ?? null;
  const days   = dayCount(entry.visited_date, entry.end_date);
  const visKey = (entry.visibility ?? 'private').toLowerCase();
  const visColor = visKey === 'public' ? C.visited : visKey === 'friends' ? T.primary : C.inkMute;
  const visIcon  = visKey === 'public'
    ? 'globe-outline' : visKey === 'friends'
    ? 'people-outline' : 'lock-closed-outline';

  return (
    <TouchableOpacity onPress={onPress} style={styles.card} activeOpacity={0.78}>
      {/* Thumbnail — matches web's 80px left column */}
      <View style={[styles.thumb, { backgroundColor: parkColor(entry.park_code) }]}>
        {cover && (
          <Image
            source={{ uri: cover }}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        )}
        {(entry.photos?.length ?? 0) > 1 && (
          <View style={styles.photoCountBadge}>
            <Ionicons name="images-outline" size={9} color={C.onPrimary} />
            <Text style={{ color: C.onPrimary, fontSize: 13, fontWeight: '600' }}>{entry.photos!.length}</Text>
          </View>
        )}
      </View>

      {/* Content — matches web's padding: 12px 14px 12px 13px */}
      <View style={styles.cardContent}>
        {/* Park name kicker */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Ionicons name="location" size={10} color={T.primary} />
          <Text style={[styles.parkKicker, { color: T.primary }]} numberOfLines={1}>
            {(entry.park_name ?? entry.park_code).toUpperCase()}
          </Text>
        </View>

        {/* Title or date */}
        <Text style={styles.entryTitle} numberOfLines={1}>
          {entry.title || fmtDate(entry.visited_date)}
        </Text>

        {/* Date range + duration badge */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={styles.entryDate}>{fmtRange(entry.visited_date, entry.end_date)}</Text>
          {days > 1 && (
            <View style={styles.daysBadge}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: T.accent }}>{days}D</Text>
            </View>
          )}
        </View>

        {/* Stars + visibility */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
          {entry.rating ? <Stars value={entry.rating} size={11} /> : <View />}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Ionicons name={visIcon as any} size={10} color={visColor} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: visColor, letterSpacing: 0.8, textTransform: 'uppercase' }}>
              {visKey}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function JournalScreen() {
  const { getToken } = useAuth();
  const tabBarSpace = useTabBarSpace();
  const router = useRouter();
  const T = useColors();
  const { parkCode, parkName } = useLocalSearchParams<{ parkCode?: string; parkName?: string }>();

  const [entries,    setEntries]    = useState<JournalEntry[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [query,      setQuery]      = useState('');
  const [yearFilter, setYearFilter] = useState<number | null>(null);
  const [sortBy,     setSortBy]     = useState<'newest' | 'oldest' | 'rating'>('newest');
  const [sortOpen,   setSortOpen]   = useState(false);
  // Deep-linked from a stamp's "view your visits" — cleared locally so the
  // user can back out to the unfiltered journal without re-navigating.
  const [parkFilter, setParkFilter] = useState<string | null>(parkCode ?? null);

  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const load = useCallback(async () => {
    const tok = await getTokenRef.current();
    if (!tok) return;
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/visits`, { headers: { Authorization: `Bearer ${tok}` } });
      if (res.ok) {
        const data = await res.json();
        setEntries(data.filter((e: JournalEntry) => !e.is_bucket_list && e.visited_date));
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const years = useMemo(() => {
    const s = new Set<number>();
    entries.forEach(e => { if (e.visited_date) s.add(new Date(e.visited_date).getFullYear()); });
    return Array.from(s).sort((a, b) => b - a);
  }, [entries]);

  const filtered = useMemo(() => {
    let list = entries;
    if (parkFilter) list = list.filter(e => e.park_code === parkFilter);
    if (yearFilter) list = list.filter(e => e.visited_date && new Date(e.visited_date).getFullYear() === yearFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(e =>
        (e.park_name ?? e.park_code).toLowerCase().includes(q) ||
        (e.title ?? '').toLowerCase().includes(q) ||
        (e.notes ?? '').toLowerCase().includes(q)
      );
    }
    if (sortBy === 'oldest')  return [...list].sort((a, b) => (a.visited_date ?? '').localeCompare(b.visited_date ?? ''));
    if (sortBy === 'rating')  return [...list].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    return [...list].sort((a, b) => (b.visited_date ?? '').localeCompare(a.visited_date ?? ''));
  }, [entries, query, yearFilter, sortBy, parkFilter]);

  const totalPhotos = useMemo(() => entries.reduce((n, e) => n + (e.photos?.length ?? 0), 0), [entries]);
  const SORT_LABELS: Record<typeof sortBy, string> = { newest: 'Newest first', oldest: 'Oldest first', rating: 'Top rated' };
  const SORT_LABELS_SHORT: Record<typeof sortBy, string> = { newest: 'Newest', oldest: 'Oldest', rating: 'Top rated' };

  const ListHeader = (
    <View>
      {/* Page header */}
      <View style={styles.pageHeader}>
        <Text style={styles.kicker}>COLLECTIONS</Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <Text style={styles.title}>Journal</Text>
        </View>
        {!loading && (
          <Text style={styles.subtitle}>
            <Text style={{ fontWeight: '700', color: C.ink }}>{entries.length}</Text>
            {' '}{entries.length === 1 ? 'entry' : 'entries'}
            {totalPhotos > 0 ? <> · <Text style={{ fontWeight: '700', color: C.ink }}>{totalPhotos}</Text> photos</> : null}
            {years.length > 0 ? <> · spanning <Text style={{ fontWeight: '700', color: C.ink }}>{years.length}</Text> {years.length === 1 ? 'year' : 'years'}</> : null}
          </Text>
        )}
      </View>

      {/* Park filter chip — deep-linked from a stamp's "view your visits" */}
      {parkFilter && (
        <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
          <TouchableOpacity
            onPress={() => setParkFilter(null)}
            style={[styles.yearPill, { alignSelf: 'flex-start', backgroundColor: T.primary, borderColor: T.primary, flexDirection: 'row', alignItems: 'center', gap: 6 }]}
          >
            <Text style={[styles.yearPillText, styles.yearPillTextOn]} numberOfLines={1}>
              {parkName ?? 'This park'} only
            </Text>
            <Ionicons name="close-circle" size={14} color={C.onPrimary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Filter bar: search + sort */}
      {(entries.length > 0 || query) && (
        <View style={styles.filterBar}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={14} color={C.inkMute} />
            <TextInput
              value={query} onChangeText={setQuery}
              placeholder="Search parks, titles, notes…" placeholderTextColor={C.inkMute}
              style={styles.searchInput} autoCorrect={false} autoCapitalize="none"
              clearButtonMode="while-editing"
            />
          </View>
          <TouchableOpacity onPress={() => setSortOpen(true)} style={styles.sortBtn}>
            <Ionicons name="funnel-outline" size={14} color={C.inkSoft} />
            <Text style={styles.sortBtnText} numberOfLines={1}>{SORT_LABELS_SHORT[sortBy]}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Year pills */}
      {years.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.yearRow}>
          {[null, ...years].map(y => (
            <TouchableOpacity
              key={y ?? 'all'} onPress={() => setYearFilter(y)}
              style={[styles.yearPill, yearFilter === y && { backgroundColor: T.primary, borderColor: T.primary }]}
            >
              <Text style={[styles.yearPillText, yearFilter === y && styles.yearPillTextOn]}>
                {y ?? 'All'}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Loading skeletons */}
      {loading && (
        <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 10 }}>
          {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
        </View>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIcon}>
            <Ionicons name="journal-outline" size={22} color={C.inkMute} />
          </View>
          <Text style={styles.emptyTitle}>
            {entries.length === 0 ? 'No journal entries yet' : 'No matching entries'}
          </Text>
          <Text style={styles.emptySub}>
            {entries.length === 0
              ? 'Log a visit to start your journal.'
              : 'Try adjusting your search or filters.'}
          </Text>
        </View>
      )}

      {/* Section gap before list */}
      {!loading && filtered.length > 0 && <View style={{ height: 12 }} />}
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      {/* Sort sheet */}
      <Modal visible={sortOpen} transparent animationType="fade" onRequestClose={() => setSortOpen(false)}>
        <Pressable style={styles.sortBackdrop} onPress={() => setSortOpen(false)} />
        <View style={styles.sortSheet}>
          <View style={styles.sortSheetHandle} />
          <Text style={styles.sortSheetTitle}>Sort by</Text>
          {(['newest', 'oldest', 'rating'] as const).map((s, i, arr) => (
            <TouchableOpacity
              key={s}
              onPress={() => { setSortBy(s); setSortOpen(false); }}
              style={[styles.sortSheetRow, i < arr.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: C.hairline }]}
            >
              <Text style={[styles.sortSheetRowText, sortBy === s && { color: T.primary, fontWeight: '700' }]}>
                {SORT_LABELS[s]}
              </Text>
              {sortBy === s && <Ionicons name="checkmark" size={17} color={T.primary} />}
            </TouchableOpacity>
          ))}
        </View>
      </Modal>

      <FlatList
        data={loading ? [] : filtered}
        keyExtractor={item => String(item.id)}
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: 16, marginBottom: 10 }}>
            <EntryCard entry={item} onPress={() => router.push(`/profile/journal/${item.id}` as never)} />
          </View>
        )}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={{ paddingBottom: tabBarSpace + 16 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },

  pageHeader: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 16 },
  kicker:     { fontSize: 13, fontWeight: '600', color: C.inkMute, letterSpacing: 1.6, marginBottom: 4 },
  title:      { fontSize: 32, fontWeight: '800', color: C.ink, letterSpacing: -0.7 },
  subtitle:   { fontSize: 13.5, color: C.inkMute, marginTop: 6 },

  filterBar:  { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 18 },
  searchBox:  {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.surface, borderRadius: 11,
    paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    borderWidth: 0.5, borderColor: C.hairline,
  },
  searchInput: { flex: 1, fontSize: 13.5, color: C.ink, padding: 0 },
  sortBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: C.surface, borderRadius: 11,
    paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    borderWidth: 0.5, borderColor: C.hairline,
  },
  sortBtnText: { fontSize: 13, fontWeight: '600', color: C.inkSoft },

  sortBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sortSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 16,
    elevation: 20,
  },
  sortSheetHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: C.hairline,
    alignSelf: 'center', marginTop: 10, marginBottom: 4,
  },
  sortSheetTitle: {
    fontSize: 13, fontWeight: '700', color: C.inkMute, letterSpacing: 0.8,
    textTransform: 'uppercase', paddingHorizontal: 20, paddingVertical: 12,
  },
  sortSheetRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
  },
  sortSheetRowText: { fontSize: 16, fontWeight: '500', color: C.ink },

  yearRow: { paddingHorizontal: 16, paddingBottom: 10, gap: 6 },
  yearPill: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9,
    backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.hairline,
  },
  yearPillText:   { fontSize: 13, fontWeight: '700', color: C.inkSoft, letterSpacing: 0.4 },
  yearPillTextOn: { color: C.onPrimary },

  emptyWrap:  { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyIcon:  {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: C.surfaceAlt, borderWidth: 0.5, borderColor: C.hairline,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: C.ink, letterSpacing: -0.2 },
  emptySub:   { fontSize: 13, color: C.inkMute, textAlign: 'center', maxWidth: 260, lineHeight: 18 },

  // Card — matches web's EntryCard layout exactly
  card: {
    flexDirection: 'row', backgroundColor: C.surface,
    borderRadius: 14, borderWidth: 0.5, borderColor: C.hairline,
    overflow: 'hidden',
  },
  thumb: {
    width: 80, flexShrink: 0,
  },
  photoCountBadge: {
    position: 'absolute', bottom: 6, right: 6,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 100,
  },
  cardContent: {
    flex: 1, minWidth: 0, padding: 12, paddingLeft: 13, paddingRight: 14, gap: 4,
  },
  parkKicker: {
    flex: 1, fontSize: 13, fontWeight: '700', letterSpacing: 0.8,
  },
  entryTitle: {
    fontSize: 14, fontWeight: '800', color: C.ink, letterSpacing: -0.2, lineHeight: 17,
  },
  entryDate:  { fontSize: 13, color: C.inkMute },
  daysBadge:  {
    backgroundColor: C.surfaceAlt, borderRadius: 100,
    paddingHorizontal: 6, paddingVertical: 1,
  },
});
