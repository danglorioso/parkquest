import {
  Alert, FlatList, Platform, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View, useColorScheme,
} from 'react-native';
import { Image } from 'expo-image';
import { useCallback, useMemo, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { MenuView } from '@react-native-menu/menu';
import { useTabBarSpace } from '@/components/FloatingTabBar';
import { GlassIconBg } from '@/components/GlassIconBg';
import { VisitDetails, type VisitStatsInput } from '@/components/VisitStats';
import { STATIC as C, colorStr, useColors } from '@/lib/palette';
import { dayCount, fmtRange } from '@/lib/dates';
import { parkColor } from '@/lib/parkColors';
import { deriveRankScore, sortByRankKey } from '@parkquest/types';

const MENU_DESTRUCTIVE = '#FF3B30';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface JournalEntry {
  id: number;
  park_code: string;
  park_name: string | null;
  park_image_url: string | null;
  states: string | null;
  visited_date: string | null;
  end_date: string | null;
  is_bucket_list: boolean;
  rank_key: string | null;
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

// ── Skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <View style={[styles.card, { overflow: 'hidden' }]}>
      <View style={{ width: 128, backgroundColor: C.surfaceAlt }} />
      <View style={{ flex: 1, padding: 12, gap: 8 }}>
        <View style={{ height: 9, width: '50%', backgroundColor: C.surfaceAlt, borderRadius: 4 }} />
        <View style={{ height: 14, width: '80%', backgroundColor: C.surfaceAlt, borderRadius: 4 }} />
        <View style={{ height: 11, width: '60%', backgroundColor: C.surfaceAlt, borderRadius: 4 }} />
        <View style={{ height: 11, width: '40%', backgroundColor: C.surfaceAlt, borderRadius: 4 }} />
      </View>
    </View>
  );
}

// ── Rank badge ────────────────────────────────────────────────────────────────

function RankBadge({ position, score }: { position: number; score: number }) {
  const T = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: T.accent }}>#{position}</Text>
      <Text style={{ fontSize: 12, fontWeight: '600', color: C.inkMute }}>{score}</Text>
    </View>
  );
}

// ── Entry card ────────────────────────────────────────────────────────────────

function EntryCard({ entry, rank, onPress, onEdit, onDelete }: {
  entry: JournalEntry; rank: { position: number; score: number } | null;
  onPress: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const T = useColors();
  const router = useRouter();
  // No user photo? Fall back to the park's own stock image rather than a
  // flat color block — still gives the card something to show.
  const cover  = entry.cover_photo ?? entry.photos?.[0] ?? entry.park_image_url ?? null;
  const days   = dayCount(entry.visited_date, entry.end_date);
  const visKey = (entry.visibility ?? 'private').toLowerCase();
  const visColor = visKey === 'public' ? C.visited : visKey === 'friends' ? T.primary : C.inkMute;
  const visIcon  = visKey === 'public'
    ? 'globe-outline' : visKey === 'friends'
    ? 'people-outline' : 'lock-closed-outline';
  // One plain sentence of context (weather/activities/who was there) — not
  // a stat strip, just enough to jog the memory of what the trip was like.
  const visitStats: VisitStatsInput = {
    visit_weather: entry.weather_conditions,
    visit_activities: entry.activities,
    visit_companion_count: entry.companions?.length ?? null,
    visit_would_return: entry.would_return,
  };

  return (
    <View>
      <TouchableOpacity onPress={onPress} style={styles.card} activeOpacity={0.78}>
        {/* Thumbnail — wide enough that the photo actually reads at a glance */}
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
          {/* Park name kicker — full name, not truncated, since it's the
              one thing this card exists to tell you. Its own tap target,
              nested inside the card's, links to the park's profile page. */}
          <TouchableOpacity
            onPress={() => router.push(`/park/${entry.park_code}` as never)}
            activeOpacity={0.6}
            style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 5, paddingRight: 26 }}
          >
            <Ionicons name="location" size={10} color={T.primary} style={{ marginTop: 2 }} />
            <Text style={[styles.parkKicker, { color: T.primary }]}>
              {(entry.park_name ?? entry.park_code).toUpperCase()}
            </Text>
          </TouchableOpacity>

          {/* Title — the date row below already covers the date, so skip
              this line entirely rather than falling back to it and
              printing the same date twice */}
          {entry.title ? (
            <Text style={styles.entryTitle} numberOfLines={1}>{entry.title}</Text>
          ) : null}

          {/* Date range + duration badge */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.entryDate}>{fmtRange(entry.visited_date, entry.end_date)}</Text>
            {days > 1 && (
              <View style={styles.daysBadge}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: T.accent }}>{days}D</Text>
              </View>
            )}
          </View>

          {/* Rank + visibility — icon only, no label */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
            {rank ? <RankBadge position={rank.position} score={rank.score} /> : <View />}
            <Ionicons name={visIcon as any} size={13} color={visColor} />
          </View>

          {/* Weather / activities / who was there — one line, memory-jogging
              context without turning this into a stat strip */}
          <VisitDetails visit={visitStats} numberOfLines={2} />
        </View>
      </TouchableOpacity>

      {/* Per-entry quick actions — native menu, matches PostCard's post-level
          "..." — top-right of the card itself (over the plain content
          surface), not floating over the thumbnail image. */}
      <View style={styles.entryMenuWrap}>
        <MenuView
          onPressAction={({ nativeEvent }) => {
            if (nativeEvent.event === 'edit') onEdit();
            else if (nativeEvent.event === 'delete') onDelete();
          }}
          actions={[
            { id: 'edit', title: 'Edit entry', image: 'pencil' },
            { id: 'delete', title: 'Delete entry', image: 'trash', imageColor: MENU_DESTRUCTIVE, attributes: { destructive: true } },
          ]}
        >
          <TouchableOpacity style={styles.entryMenuBtn} hitSlop={8} activeOpacity={0.8}>
            <GlassIconBg borderRadius={12} fallbackColor={colorStr(C.surface)} />
            <Ionicons name="ellipsis-horizontal" size={13} color={C.inkMute} />
          </TouchableOpacity>
        </MenuView>
      </View>
    </View>
  );
}

// ── Grid entry card ───────────────────────────────────────────────────────────
// Compact 2-column variant for grid view — photo-forward, just enough text
// to identify the trip; the full facts line lives in list view instead.

function GridEntryCard({ entry, onPress, onEdit, onDelete }: {
  entry: JournalEntry; onPress: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const T = useColors();
  const router = useRouter();
  const cover  = entry.cover_photo ?? entry.photos?.[0] ?? null;
  const visKey = (entry.visibility ?? 'private').toLowerCase();
  const visColor = visKey === 'public' ? C.visited : visKey === 'friends' ? T.primary : C.inkMute;
  const visIcon  = visKey === 'public'
    ? 'globe-outline' : visKey === 'friends'
    ? 'people-outline' : 'lock-closed-outline';

  return (
    <View style={{ flex: 1 }}>
      <TouchableOpacity onPress={onPress} style={styles.gridCard} activeOpacity={0.85}>
        <View style={[styles.gridPhoto, { backgroundColor: parkColor(entry.park_code) }]}>
          {cover ? (
            <Image
              source={{ uri: cover }}
              style={StyleSheet.absoluteFillObject}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 10 }}>
              <Text style={styles.gridPhotoFallbackText} numberOfLines={3}>
                {(entry.park_name ?? entry.park_code).toUpperCase()}
              </Text>
            </View>
          )}
          {(entry.photos?.length ?? 0) > 1 && (
            <View style={styles.photoCountBadge}>
              <Ionicons name="images-outline" size={9} color={C.onPrimary} />
              <Text style={{ color: C.onPrimary, fontSize: 13, fontWeight: '600' }}>{entry.photos!.length}</Text>
            </View>
          )}
        </View>

        <View style={{ padding: 10, gap: 3 }}>
          <TouchableOpacity onPress={() => router.push(`/park/${entry.park_code}` as never)} activeOpacity={0.6}>
            <Text style={[styles.parkKicker, { color: T.primary, fontSize: 12 }]} numberOfLines={1}>
              {(entry.park_name ?? entry.park_code).toUpperCase()}
            </Text>
          </TouchableOpacity>
          <Text style={styles.entryTitle} numberOfLines={1}>
            {entry.title || fmtRange(entry.visited_date, entry.end_date)}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 1 }}>
            <Text style={styles.entryDate} numberOfLines={1}>{fmtRange(entry.visited_date, entry.end_date)}</Text>
            <Ionicons name={visIcon as any} size={12} color={visColor} />
          </View>
        </View>
      </TouchableOpacity>

      <View style={styles.entryMenuWrap}>
        <MenuView
          onPressAction={({ nativeEvent }) => {
            if (nativeEvent.event === 'edit') onEdit();
            else if (nativeEvent.event === 'delete') onDelete();
          }}
          actions={[
            { id: 'edit', title: 'Edit entry', image: 'pencil' },
            { id: 'delete', title: 'Delete entry', image: 'trash', imageColor: MENU_DESTRUCTIVE, attributes: { destructive: true } },
          ]}
        >
          <TouchableOpacity style={styles.entryMenuBtn} hitSlop={8} activeOpacity={0.8}>
            <GlassIconBg onMedia fallbackColor="rgba(20,17,12,0.45)" />
            <Ionicons name="ellipsis-horizontal" size={13} color="#FFFBF1" />
          </TouchableOpacity>
        </MenuView>
      </View>
    </View>
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
  const [sortBy,     setSortBy]     = useState<'newest' | 'oldest' | 'rank'>('newest');
  const [viewMode,      setViewMode]      = useState<'grid' | 'list'>('list');
  const [showViewMenu,  setShowViewMenu]  = useState(false);
  const menuInk = useColorScheme() === 'dark' ? '#FFFBF1' : '#26231C';
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

  const confirmDeleteEntry = useCallback((entry: JournalEntry) => {
    Alert.alert(
      'Delete entry',
      `Delete your ${entry.park_name ?? entry.park_code} visit? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            const tok = await getTokenRef.current();
            if (!tok) return;
            const res = await fetch(
              `${BASE}/api/visits?park_code=${encodeURIComponent(entry.park_code)}`,
              { method: 'DELETE', headers: { Authorization: `Bearer ${tok}` } },
            );
            if (res.ok) setEntries(list => list.filter(e => e.id !== entry.id));
            else Alert.alert('Delete failed', 'Could not delete entry.');
          },
        },
      ],
    );
  }, []);

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
    if (sortBy === 'oldest') return [...list].sort((a, b) => (a.visited_date ?? '').localeCompare(b.visited_date ?? ''));
    if (sortBy === 'rank') {
      const order = new Map(sortByRankKey(list).map((e, i) => [e.id, i]));
      return [...list].sort((a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity));
    }
    return [...list].sort((a, b) => (b.visited_date ?? '').localeCompare(a.visited_date ?? ''));
  }, [entries, query, yearFilter, sortBy, parkFilter]);

  // Rank position/score is relative to ALL ranked visits, not just the
  // filtered/sorted view above — computed once from the full entries list.
  const rankById = useMemo(() => {
    const ranked = sortByRankKey(entries);
    const m = new Map<number, { position: number; score: number }>();
    ranked.forEach((e, i) => m.set(e.id, { position: i + 1, score: deriveRankScore(i, ranked.length) }));
    return m;
  }, [entries]);

  const totalPhotos = useMemo(() => entries.reduce((n, e) => n + (e.photos?.length ?? 0), 0), [entries]);
  const SORT_LABELS: Record<typeof sortBy, string> = { newest: 'Newest first', oldest: 'Oldest first', rank: 'Top ranked' };
  const SORT_LABELS_SHORT: Record<typeof sortBy, string> = { newest: 'Newest', oldest: 'Oldest', rank: 'Top ranked' };

  const ListHeader = (
    <View>
      {/* Page header */}
      <View style={styles.pageHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={styles.title}>Visits</Text>
          <MenuView
            onOpenMenu={() => setShowViewMenu(true)}
            onCloseMenu={() => setShowViewMenu(false)}
            onPressAction={({ nativeEvent }) => setViewMode(nativeEvent.event as 'grid' | 'list')}
            actions={[
              // Explicit imageColor: the menu lib's new-arch bridge tints
              // unset icons with color 0 (transparent) — see parks page.
              { id: 'grid', title: 'Grid', image: 'square.grid.2x2', imageColor: menuInk, state: viewMode === 'grid' ? 'on' : 'off' },
              { id: 'list', title: 'List', image: 'list.bullet', imageColor: menuInk, state: viewMode === 'list' ? 'on' : 'off' },
            ]}
          >
            <TouchableOpacity
              hitSlop={8}
              activeOpacity={0.7}
              style={[styles.viewToggle, showViewMenu && { backgroundColor: T.primary + '14', borderColor: T.primary }]}
            >
              <GlassIconBg />
              <Ionicons
                name={viewMode === 'grid' ? 'grid-outline' : 'list-outline'}
                size={20}
                color={showViewMenu ? T.primary : C.inkSoft}
              />
            </TouchableOpacity>
          </MenuView>
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
          <MenuView
            onPressAction={({ nativeEvent }) => setSortBy(nativeEvent.event as typeof sortBy)}
            actions={(['newest', 'oldest', 'rank'] as const).map(s => ({
              id: s, title: SORT_LABELS[s], state: sortBy === s ? 'on' : 'off',
            }))}
          >
            <TouchableOpacity style={styles.sortBtn} activeOpacity={0.8}>
              <GlassIconBg borderRadius={11} fallbackColor={colorStr(C.surface)} />
              <Ionicons name="swap-vertical-outline" size={14} color={C.inkSoft} />
              <Text style={styles.sortBtnText} numberOfLines={1}>{SORT_LABELS_SHORT[sortBy]}</Text>
            </TouchableOpacity>
          </MenuView>
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
            {entries.length === 0 ? 'No visits yet' : 'No matching entries'}
          </Text>
          <Text style={styles.emptySub}>
            {entries.length === 0
              ? 'Log a visit to get started.'
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
      <FlatList
        // FlatList requires a remount when numColumns changes — key does that.
        key={viewMode}
        data={loading ? [] : filtered}
        numColumns={viewMode === 'grid' ? 2 : 1}
        columnWrapperStyle={viewMode === 'grid' ? { paddingHorizontal: 16, gap: 10 } : undefined}
        keyExtractor={item => String(item.id)}
        renderItem={({ item }) =>
          viewMode === 'grid' ? (
            <View style={{ flex: 1, marginBottom: 10 }}>
              <GridEntryCard
                entry={item}
                onPress={() => router.push(`/profile/journal/${item.id}` as never)}
                onEdit={() => router.push(`/profile/journal/${item.id}?edit=1` as never)}
                onDelete={() => confirmDeleteEntry(item)}
              />
            </View>
          ) : (
            <View style={{ paddingHorizontal: 16, marginBottom: 10 }}>
              <EntryCard
                entry={item}
                rank={rankById.get(item.id) ?? null}
                onPress={() => router.push(`/profile/journal/${item.id}` as never)}
                onEdit={() => router.push(`/profile/journal/${item.id}?edit=1` as never)}
                onDelete={() => confirmDeleteEntry(item)}
              />
            </View>
          )
        }
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
  title:      { fontSize: 32, fontWeight: '800', color: C.ink, letterSpacing: -0.7 },
  subtitle:   { fontSize: 13.5, color: C.inkMute, marginTop: 6 },
  // 44pt, the app-wide round icon button size (matches the parks page's own
  // grid/list toggle).
  viewToggle: {
    width: 44, height: 44, borderRadius: 22, overflow: 'hidden',
    borderWidth: 0.5, borderColor: C.hairline,
    alignItems: 'center', justifyContent: 'center',
  },

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
    borderRadius: 11, overflow: 'hidden',
    paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    borderWidth: 0.5, borderColor: C.hairline,
  },
  sortBtnText: { fontSize: 13, fontWeight: '600', color: C.inkSoft },

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
    width: 128, flexShrink: 0,
  },
  gridCard: {
    backgroundColor: C.surface, borderRadius: 14,
    borderWidth: 0.5, borderColor: C.hairline, overflow: 'hidden',
  },
  gridPhoto: { width: '100%', aspectRatio: 1 },
  gridPhotoFallbackText: {
    fontSize: 12, fontWeight: '700', color: 'rgba(255,251,241,0.75)',
    letterSpacing: 0.6, textAlign: 'center',
  },
  photoCountBadge: {
    position: 'absolute', bottom: 6, right: 6,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 100,
  },
  // Top-right of the card itself — over the plain content surface, not
  // floating over the thumbnail image.
  entryMenuWrap: {
    position: 'absolute', top: 8, right: 8,
  },
  entryMenuBtn: {
    width: 24, height: 24, borderRadius: 12, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
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
