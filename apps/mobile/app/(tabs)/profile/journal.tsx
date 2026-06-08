import {
  ActivityIndicator, Image, Modal, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
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
  primary:    '#1F3D2E',
  accent:     '#C56B3D',
  visited:    '#2F7A4A',
};

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

const GRADIENTS = ['#1F3D2E', '#2D4F66', '#7B3A1F', '#3A2E5C', '#2F7A4A'];
function gradientColor(code: string) {
  return GRADIENTS[code.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % GRADIENTS.length];
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_ABB = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const CROWD_LABELS  = ['','Empty','Quiet','Moderate','Busy','Packed'];
const DIFF_LABELS   = ['','Easy','Light','Moderate','Hard','Strenuous'];
const WEATHER_LABELS: Record<string, string> = {
  clear:'Clear', partly:'Partly cloudy', cloudy:'Cloudy', rain:'Rain',
  storm:'Storms', snow:'Snow', fog:'Fog', wind:'Windy',
};
const RETURN_LABELS: Record<string, string> = { yes:'Definitely', maybe:'Maybe', no:'Probably not' };
const RETURN_EMOJI:  Record<string, string> = { yes:'❤️', maybe:'🤔', no:'☁️' };

// ── Types ─────────────────────────────────────────────────────────────────────

interface JournalEntry {
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
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function fmtRange(start: string | null, end: string | null): string {
  if (!start) return '';
  const s = new Date(start);
  if (!end) return `${MONTHS[s.getMonth()]} ${s.getDate()}, ${s.getFullYear()}`;
  const e = new Date(end);
  if (s.getFullYear() === e.getFullYear()) {
    if (s.getMonth() === e.getMonth())
      return `${MONTHS[s.getMonth()]} ${s.getDate()}–${e.getDate()}, ${e.getFullYear()}`;
    return `${MONTHS_ABB[s.getMonth()]} ${s.getDate()} – ${MONTHS_ABB[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
  }
  return `${MONTHS_ABB[s.getMonth()]} ${s.getDate()}, ${s.getFullYear()} – ${MONTHS_ABB[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
}

function dayCount(start: string | null, end: string | null): number {
  if (!start) return 0;
  if (!end) return 1;
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1;
}

// ── Stars ─────────────────────────────────────────────────────────────────────

function Stars({ value, size = 11 }: { value: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 1 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Ionicons
          key={i}
          name={i < Math.round(value) ? 'star' : 'star-outline'}
          size={size} color={C.accent}
        />
      ))}
    </View>
  );
}

// ── Entry card ────────────────────────────────────────────────────────────────

function EntryCard({ entry, onPress }: { entry: JournalEntry; onPress: () => void }) {
  const cover = entry.cover_photo ?? entry.photos?.[0] ?? null;
  const days  = dayCount(entry.visited_date, entry.end_date);
  const visKey = (entry.visibility ?? 'private').toLowerCase();
  const visColor = visKey === 'public' ? C.visited : visKey === 'friends' ? C.primary : C.inkMute;
  const visIcon  = visKey === 'public' ? 'globe-outline' : visKey === 'friends' ? 'people-outline' : 'lock-closed-outline';

  return (
    <TouchableOpacity onPress={onPress} style={styles.entryCard} activeOpacity={0.8}>
      {/* Cover thumbnail */}
      <View style={[styles.entryThumb, { backgroundColor: gradientColor(entry.park_code) }]}>
        {cover && (
          <Image source={{ uri: cover }} style={StyleSheet.absoluteFill as any} resizeMode="cover" />
        )}
        {(entry.photos?.length ?? 0) > 1 && (
          <View style={styles.entryPhotoCount}>
            <Ionicons name="images-outline" size={9} color="#FFFBF1" />
            <Text style={{ color: '#FFFBF1', fontSize: 9, fontWeight: '600' }}>{entry.photos!.length}</Text>
          </View>
        )}
      </View>

      {/* Content */}
      <View style={{ flex: 1, padding: 12, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Ionicons name="location" size={10} color={C.primary} />
          <Text style={styles.entryParkName} numberOfLines={1}>
            {(entry.park_name ?? entry.park_code).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.entryTitle} numberOfLines={1}>
          {entry.title || fmtDate(entry.visited_date)}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={styles.entryDate}>{fmtRange(entry.visited_date, entry.end_date)}</Text>
          {days > 1 && (
            <View style={styles.durationBadge}>
              <Text style={{ fontSize: 9, fontWeight: '700', color: C.accent }}>{days}D</Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
          {entry.rating ? <Stars value={entry.rating} /> : <View />}
          <Ionicons name={visIcon as any} size={12} color={visColor} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Entry detail modal ────────────────────────────────────────────────────────

function EntryDetailModal({ entry, onClose }: { entry: JournalEntry; onClose: () => void }) {
  const router = useRouter();
  const [photoIdx, setPhotoIdx] = useState(0);
  const imgs = entry.photos ?? [];
  const days = dayCount(entry.visited_date, entry.end_date);

  useEffect(() => {
    const coverIdx = entry.cover_photo ? Math.max(0, imgs.indexOf(entry.cover_photo)) : 0;
    setPhotoIdx(coverIdx);
  }, [entry.id]);

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.detailHeader}>
          <TouchableOpacity onPress={onClose} style={styles.detailClose}>
            <Ionicons name="close" size={20} color={C.ink} />
          </TouchableOpacity>
          <Text style={styles.detailHeaderTitle} numberOfLines={1}>
            {entry.park_name ?? entry.park_code}
          </Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Photo section */}
          {imgs.length > 0 && (
            <View style={[styles.detailPhoto, { backgroundColor: gradientColor(entry.park_code) }]}>
              <Image source={{ uri: imgs[photoIdx] }} style={StyleSheet.absoluteFill as any} resizeMode="cover" />
              {imgs.length > 1 && (
                <>
                  <TouchableOpacity
                    style={[styles.photoArrow, { left: 12 }]}
                    onPress={() => setPhotoIdx(i => (i - 1 + imgs.length) % imgs.length)}
                  >
                    <Ionicons name="chevron-back" size={18} color={C.ink} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.photoArrow, { right: 12 }]}
                    onPress={() => setPhotoIdx(i => (i + 1) % imgs.length)}
                  >
                    <Ionicons name="chevron-forward" size={18} color={C.ink} />
                  </TouchableOpacity>
                  <View style={styles.photoIndicator}>
                    <Text style={{ color: '#FFFBF1', fontSize: 11, fontWeight: '600' }}>
                      {photoIdx + 1}/{imgs.length}
                    </Text>
                  </View>
                </>
              )}
            </View>
          )}

          <View style={{ padding: 20 }}>
            {/* Park + state */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Ionicons name="location" size={13} color={C.primary} />
              <Text style={{ fontSize: 11, fontWeight: '700', color: C.primary, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                {entry.park_name ?? entry.park_code}
              </Text>
              {entry.states ? (
                <Text style={{ fontSize: 10, color: C.inkMute }}>· {fullStateName(entry.states.split(',')[0].trim())}</Text>
              ) : null}
            </View>

            {/* Title */}
            {entry.title && (
              <Text style={{ fontSize: 22, fontWeight: '900', color: C.ink, letterSpacing: -0.4, lineHeight: 26, marginBottom: 10 }}>
                {entry.title}
              </Text>
            )}

            {/* Date + duration + rating + visibility */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 18, paddingBottom: 16, borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.inkSoft }}>{fmtRange(entry.visited_date, entry.end_date)}</Text>
              {days > 1 && (
                <View style={styles.durationBadge}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: C.accent }}>{days} DAYS</Text>
                </View>
              )}
              {entry.rating ? <Stars value={entry.rating} size={14} /> : null}
            </View>

            {/* Highlight */}
            {entry.highlight ? (
              <View style={{ marginBottom: 18 }}>
                <Text style={styles.metaLabel}>Highlight</Text>
                <Text style={{ fontSize: 15, fontWeight: '600', color: C.ink, fontStyle: 'italic', lineHeight: 22 }}>
                  &ldquo;{entry.highlight}&rdquo;
                </Text>
              </View>
            ) : null}

            {/* Conditions */}
            {(entry.crowd || entry.difficulty || entry.weather_conditions?.length || entry.would_return) ? (
              <View style={{ marginBottom: 18 }}>
                <Text style={styles.metaLabel}>Conditions</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                  {entry.crowd ? <MetaChip>👥 {CROWD_LABELS[entry.crowd]}</MetaChip> : null}
                  {entry.difficulty ? <MetaChip>🥾 {DIFF_LABELS[entry.difficulty]}</MetaChip> : null}
                  {entry.weather_conditions?.map(w => <MetaChip key={w}>🌤 {WEATHER_LABELS[w] ?? w}</MetaChip>)}
                  {entry.would_return ? <MetaChip>{RETURN_EMOJI[entry.would_return]} Return: {RETURN_LABELS[entry.would_return]}</MetaChip> : null}
                </View>
              </View>
            ) : null}

            {/* Activities */}
            {entry.activities && entry.activities.length > 0 ? (
              <View style={{ marginBottom: 18 }}>
                <Text style={styles.metaLabel}>Activities</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                  {entry.activities.map(a => <MetaChip key={a}>{a.charAt(0).toUpperCase() + a.slice(1)}</MetaChip>)}
                </View>
              </View>
            ) : null}

            {/* Notes */}
            {entry.notes ? (
              <View style={{ marginBottom: 18 }}>
                <Text style={styles.metaLabel}>Notes</Text>
                <Text style={{ fontSize: 14, color: C.inkSoft, lineHeight: 21 }}>{entry.notes}</Text>
              </View>
            ) : null}

            {/* Photos strip (if multiple) */}
            {imgs.length > 1 && (
              <View>
                <Text style={styles.metaLabel}>Photos · {imgs.length}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {imgs.map((url, i) => (
                      <TouchableOpacity key={url} onPress={() => setPhotoIdx(i)}>
                        <Image
                          source={{ uri: url }}
                          style={[styles.thumbImg, i === photoIdx && { borderWidth: 2, borderColor: C.primary }]}
                        />
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}

            {/* Action: log another visit to this park */}
            <TouchableOpacity
              style={styles.logBtn}
              onPress={() => { onClose(); router.push('/(modals)/log-visit' as never); }}
            >
              <Ionicons name="add" size={16} color="#FFFBF1" />
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFBF1' }}>Log another visit</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.surfaceAlt, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 5 }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: C.inkSoft }}>{children}</Text>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function JournalScreen() {
  const { getToken } = useAuth();
  const [entries,    setEntries]    = useState<JournalEntry[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [query,      setQuery]      = useState('');
  const [yearFilter, setYearFilter] = useState<number | null>(null);
  const [sortBy,     setSortBy]     = useState<'newest' | 'oldest' | 'rating'>('newest');
  const [selected,   setSelected]   = useState<JournalEntry | null>(null);
  const [sortOpen,   setSortOpen]   = useState(false);

  useEffect(() => {
    (async () => {
      const tok = await getToken();
      if (!tok) return;
      try {
        const res = await fetch(`${BASE}/api/visits`, { headers: { Authorization: `Bearer ${tok}` } });
        if (res.ok) {
          const data = await res.json();
          setEntries(data.filter((e: JournalEntry) => !e.is_bucket_list && e.visited_date));
        }
      } catch (e) {
        console.error('Journal load error:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [getToken]);

  const years = useMemo(() => {
    const s = new Set<number>();
    entries.forEach(e => { if (e.visited_date) s.add(new Date(e.visited_date).getFullYear()); });
    return Array.from(s).sort((a, b) => b - a);
  }, [entries]);

  const filtered = useMemo(() => {
    let list = entries;
    if (yearFilter) list = list.filter(e => e.visited_date && new Date(e.visited_date).getFullYear() === yearFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(e =>
        (e.park_name ?? e.park_code).toLowerCase().includes(q) ||
        (e.title ?? '').toLowerCase().includes(q) ||
        (e.notes ?? '').toLowerCase().includes(q)
      );
    }
    if (sortBy === 'oldest')  list = [...list].sort((a, b) => (a.visited_date ?? '').localeCompare(b.visited_date ?? ''));
    else if (sortBy === 'newest') list = [...list].sort((a, b) => (b.visited_date ?? '').localeCompare(a.visited_date ?? ''));
    else if (sortBy === 'rating') list = [...list].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    return list;
  }, [entries, query, yearFilter, sortBy]);

  const totalPhotos = useMemo(() => entries.reduce((n, e) => n + (e.photos?.length ?? 0), 0), [entries]);

  const SORT_LABELS = { newest: 'Newest first', oldest: 'Oldest first', rating: 'Top rated' };

  if (loading) {
    return (
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerKicker}>COLLECTIONS</Text>
        <Text style={styles.headerTitle}>Journal</Text>
        {!loading && (
          <Text style={styles.headerSub}>
            <Text style={{ fontWeight: '700', color: C.ink }}>{entries.length}</Text>{' '}
            {entries.length === 1 ? 'entry' : 'entries'}
            {totalPhotos > 0 ? <> · <Text style={{ fontWeight: '700', color: C.ink }}>{totalPhotos}</Text> photos</> : null}
            {years.length > 0 ? <> · <Text style={{ fontWeight: '700', color: C.ink }}>{years.length}</Text> {years.length === 1 ? 'year' : 'years'}</> : null}
          </Text>
        )}
      </View>

      {/* Filter bar */}
      {entries.length > 0 && (
        <View style={styles.filterBar}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={14} color={C.inkMute} />
            <TextInput
              value={query} onChangeText={setQuery}
              placeholder="Search parks, titles, notes…" placeholderTextColor={C.inkMute}
              style={styles.searchInput} autoCorrect={false} autoCapitalize="none"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={15} color={C.inkMute} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity onPress={() => setSortOpen(o => !o)} style={styles.sortBtn}>
            <Ionicons name="options-outline" size={15} color={C.inkSoft} />
            <Text style={styles.sortBtnText}>{SORT_LABELS[sortBy]}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Sort dropdown */}
      {sortOpen && (
        <View style={styles.sortDropdown}>
          {(['newest', 'oldest', 'rating'] as const).map(s => (
            <TouchableOpacity
              key={s} onPress={() => { setSortBy(s); setSortOpen(false); }}
              style={styles.sortOption}
            >
              <Text style={[styles.sortOptionText, sortBy === s && { color: C.primary, fontWeight: '700' }]}>
                {SORT_LABELS[s]}
              </Text>
              {sortBy === s && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.primary }} />}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Year filter */}
      {years.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.yearFilter}>
          {[null, ...years].map(y => (
            <TouchableOpacity
              key={y ?? 'all'} onPress={() => setYearFilter(y)}
              style={[styles.yearPill, yearFilter === y && styles.yearPillActive]}
            >
              <Text style={[styles.yearPillText, yearFilter === y && styles.yearPillTextActive]}>
                {y ?? 'All'}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Entry list */}
      {filtered.length === 0 && !loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="journal-outline" size={22} color={C.inkMute} />
          </View>
          <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>
            {entries.length === 0 ? 'No journal entries yet' : 'No matching entries'}
          </Text>
          <Text style={{ fontSize: 13, color: C.inkMute, textAlign: 'center', maxWidth: 260, lineHeight: 18 }}>
            {entries.length === 0
              ? 'Log a visit to start your journal.'
              : 'Try adjusting your search or filters.'}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40, gap: 10 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {filtered.map(entry => (
            <EntryCard key={entry.id} entry={entry} onPress={() => setSelected(entry)} />
          ))}
        </ScrollView>
      )}

      {selected && (
        <EntryDetailModal entry={selected} onClose={() => setSelected(null)} />
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },

  header: {
    paddingHorizontal: 16, paddingTop: 20, paddingBottom: 16,
  },
  headerKicker: {
    fontSize: 9.5, fontWeight: '600', color: C.inkMute, letterSpacing: 1.4, marginBottom: 3,
  },
  headerTitle: {
    fontSize: 28, fontWeight: '900', color: C.ink, letterSpacing: -0.6,
  },
  headerSub: {
    fontSize: 13, color: C.inkMute, marginTop: 4,
  },

  filterBar: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 8,
  },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.surface, borderRadius: 11, padding: 10,
    borderWidth: 0.5, borderColor: C.hairline,
  },
  searchInput: {
    flex: 1, fontSize: 13.5, color: C.ink, padding: 0,
  },
  sortBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: C.surface, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 0.5, borderColor: C.hairline,
  },
  sortBtnText: {
    fontSize: 12, fontWeight: '600', color: C.inkSoft,
  },
  sortDropdown: {
    position: 'absolute', top: 140, right: 16, zIndex: 50,
    backgroundColor: C.surface, borderRadius: 10,
    borderWidth: 0.5, borderColor: C.hairline,
    overflow: 'hidden', minWidth: 160,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.14, shadowRadius: 20,
    elevation: 10,
  },
  sortOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 11,
    borderBottomWidth: 0.5, borderBottomColor: C.hairline,
  },
  sortOptionText: {
    fontSize: 13, fontWeight: '500', color: C.inkSoft,
  },

  yearFilter: {
    paddingHorizontal: 16, paddingBottom: 8, gap: 6,
  },
  yearPill: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9,
    backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.hairline,
  },
  yearPillActive: {
    backgroundColor: C.primary, borderColor: C.primary,
  },
  yearPillText: {
    fontSize: 11, fontWeight: '700', color: C.inkSoft, letterSpacing: 0.4,
  },
  yearPillTextActive: {
    color: '#FFFBF1',
  },

  // Entry card
  entryCard: {
    flexDirection: 'row', backgroundColor: C.surface, borderRadius: 14,
    borderWidth: 0.5, borderColor: C.hairline, overflow: 'hidden',
  },
  entryThumb: {
    width: 82, flexShrink: 0, position: 'relative',
  },
  entryPhotoCount: {
    position: 'absolute', bottom: 6, right: 6,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 100,
    flexDirection: 'row', alignItems: 'center', gap: 2,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  entryParkName: {
    fontSize: 9.5, fontWeight: '700', color: C.primary, letterSpacing: 0.6, flex: 1,
  },
  entryTitle: {
    fontSize: 14, fontWeight: '800', color: C.ink, letterSpacing: -0.2,
  },
  entryDate: {
    fontSize: 11.5, color: C.inkMute,
  },
  durationBadge: {
    backgroundColor: 'rgba(197,107,61,0.12)', borderRadius: 100, paddingHorizontal: 6, paddingVertical: 1,
  },

  // Entry detail
  detailHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 6, paddingBottom: 12,
    borderBottomWidth: 0.5, borderBottomColor: C.hairline,
  },
  detailClose: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: C.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  detailHeaderTitle: {
    fontSize: 15, fontWeight: '700', color: C.ink, flex: 1, textAlign: 'center', marginHorizontal: 8,
  },
  detailPhoto: {
    height: 220, position: 'relative',
  },
  photoArrow: {
    position: 'absolute', top: '50%', marginTop: -18,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,251,241,0.88)',
    alignItems: 'center', justifyContent: 'center',
  },
  photoIndicator: {
    position: 'absolute', bottom: 10, right: 12,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 100,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  metaLabel: {
    fontSize: 9.5, fontWeight: '600', color: C.inkMute,
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6,
  },
  thumbImg: {
    width: 64, height: 64, borderRadius: 8,
  },
  logBtn: {
    marginTop: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: C.primary, borderRadius: 12, paddingVertical: 13,
  },
});
