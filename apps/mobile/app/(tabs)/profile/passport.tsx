import {
  Dimensions, FlatList, Image, Platform, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { useCallback, useMemo, useRef, useState } from 'react';
import Svg, { Path } from 'react-native-svg';
import { ParkStamp } from '@/components/ParkStamp';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { useTabBarSpace } from '@/components/FloatingTabBar';

// ── Constants ─────────────────────────────────────────────────────────────────

const C = {
  bg:          '#F2EBDB',
  surface:     '#FFFBF1',
  surfaceAlt:  '#F7F0DE',
  ink:         '#1B1A16',
  inkSoft:     '#3C3A33',
  inkMute:     '#7A746A',
  hairline:    'rgba(27,26,22,0.10)',
  primary:     '#1F3D2E',
  primaryDeep: '#152A20',
};

const PAPER  = '#FAF3E0';
const GOLD   = '#C9A94A';
const P_INK  = '#3A2E1C';
const P_MUTE = 'rgba(58,46,28,0.45)';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
const W    = Dimensions.get('window').width;

const CELL_W  = Math.floor((W - 32 - 16) / 3);
const STAMP_D = Math.min(88, CELL_W - 8);
const ROWS_PER_PAGE = 4; // 12 stamps = one "book page"

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProfileInfo {
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
}

interface Park {
  park_code: string;
  name: string;
  states: string;
}

interface Visit {
  park_code: string;
  is_bucket_list: boolean;
  visited_date: string | null;
}

interface StampItem {
  park_code: string;
  name: string;
  states: string;
  visited: boolean;
  visited_date: string | null;
  colorIdx: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function passportNo(username: string): string {
  const n = ((username.length * 73291 + 41023) % 9999999).toString().padStart(7, '0');
  return `PQ${n}`;
}

function stampDateStr(iso: string): string {
  const d = new Date(iso);
  const M = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return `${M[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// ── Row types for FlatList ────────────────────────────────────────────────────

type RowItem =
  | { type: 'header' }
  | { type: 'stamps'; rowIdx: number; items: StampItem[] }
  | { type: 'divider'; pageNum: number }
  | { type: 'empty' }
  | { type: 'skeleton'; idx: number };

// ── Stamp cell ────────────────────────────────────────────────────────────────

function StampCell({ item, onPress }: { item: StampItem; onPress: () => void }) {
  const date = item.visited_date ? stampDateStr(item.visited_date) : '';
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={st.stampCell}
    >
      <ParkStamp
        parkCode={item.park_code}
        name={item.name}
        states={item.states}
        colorIdx={item.colorIdx}
        size={STAMP_D}
      />
      <Text numberOfLines={2} style={st.stampName}>{item.name}</Text>
      {date ? <Text style={st.stampDate}>{date}</Text> : null}
    </TouchableOpacity>
  );
}

function StampPlaceholder({ item }: { item: StampItem }) {
  return (
    <View style={[st.stampCell, { opacity: 0.22 }]}>
      <View style={[st.placeholderCircle, { width: STAMP_D, height: STAMP_D, borderRadius: STAMP_D / 2 }]}>
        <Ionicons name="add" size={18} color={P_INK} />
      </View>
      <Text numberOfLines={2} style={[st.stampName, { color: P_INK }]}>{item.name}</Text>
    </View>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <View style={st.stampRow}>
      {[0,1,2].map(i => (
        <View key={i} style={st.stampCell}>
          <View style={{ width: STAMP_D, height: STAMP_D, borderRadius: STAMP_D / 2, backgroundColor: 'rgba(58,46,28,0.08)' }} />
          <View style={{ width: CELL_W - 12, height: 8, borderRadius: 4, backgroundColor: 'rgba(58,46,28,0.06)', marginTop: 8 }} />
        </View>
      ))}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function PassportScreen() {
  const { getToken }  = useAuth();
  const tabBarSpace = useTabBarSpace();
  const { user }      = useUser();
  const router        = useRouter();

  const [profile,     setProfile]     = useState<ProfileInfo | null>(null);
  const [visits,      setVisits]      = useState<Visit[]>([]);
  const [allParks,    setAllParks]    = useState<Park[]>([]);
  const [badgeCount,  setBadgeCount]  = useState(0);
  const [totalBadges, setTotalBadges] = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(false);

  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const load = useCallback(async () => {
    const tok = await getTokenRef.current();
    if (!tok) return;
    setLoading(true);
    setError(false);
    try {
      const [profRes, visitsRes, parksRes, badgesRes] = await Promise.allSettled([
        fetch(`${BASE}/api/profile`, { headers: { Authorization: `Bearer ${tok}` } }).then(r => r.ok ? r.json() : null),
        fetch(`${BASE}/api/visits`,  { headers: { Authorization: `Bearer ${tok}` } }).then(r => r.ok ? r.json() : []),
        fetch(`${BASE}/api/parks`,   { headers: { Authorization: `Bearer ${tok}` } }).then(r => r.ok ? r.json() : []),
        fetch(`${BASE}/api/badges`,  { headers: { Authorization: `Bearer ${tok}` } }).then(r => r.ok ? r.json() : { badges: [] }),
      ]);
      if ([profRes, visitsRes, parksRes, badgesRes].every(r => r.status === 'rejected')) {
        setError(true);
      }
      if (profRes.status   === 'fulfilled' && profRes.value)   setProfile(profRes.value);
      if (visitsRes.status === 'fulfilled') setVisits(visitsRes.value ?? []);
      if (parksRes.status  === 'fulfilled') setAllParks(parksRes.value ?? []);
      if (badgesRes.status === 'fulfilled') {
        const all = badgesRes.value?.badges ?? badgesRes.value ?? [];
        setBadgeCount(all.filter((b: { earned: boolean }) => b.earned).length);
        setTotalBadges(all.length);
      }
    } catch (e) {
      console.error('Passport load:', e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // All parks: visited (chrono) first, then unvisited
  const allStampItems = useMemo((): StampItem[] => {
    const visitedMap = new Map<string, string>();
    visits.forEach(v => {
      if (!v.is_bucket_list && v.visited_date) visitedMap.set(v.park_code, v.visited_date);
    });
    const visited: StampItem[] = [];
    const unvisited: StampItem[] = [];
    allParks.forEach((p, idx) => {
      const date = visitedMap.get(p.park_code) ?? null;
      const entry: StampItem = {
        park_code: p.park_code, name: p.name, states: p.states,
        visited: !!date, visited_date: date, colorIdx: idx,
      };
      if (date) visited.push(entry);
      else unvisited.push(entry);
    });
    visited.sort((a, b) => (a.visited_date ?? '').localeCompare(b.visited_date ?? ''));
    return [...visited, ...unvisited];
  }, [allParks, visits]);

  const visitedCount = useMemo(() => allStampItems.filter(s => s.visited).length, [allStampItems]);
  const bucketCount  = useMemo(() => visits.filter(v => v.is_bucket_list).length, [visits]);
  const statesCount  = useMemo(() => {
    const s = new Set<string>();
    allStampItems.filter(si => si.visited).forEach(si => si.states.split(',').forEach(st => s.add(st.trim())));
    return s.size;
  }, [allStampItems]);

  const avatarUrl = profile?.avatar_url || user?.imageUrl || null;
  // null = profile not loaded yet — header shows a skeleton bar, not "Explorer"
  const name = profile?.display_name ?? profile?.username ?? null;
  const pNo  = passportNo(profile?.username ?? user?.username ?? 'explorer');

  // Build FlatList rows: header + stamp rows (with page dividers)
  const listData = useMemo((): RowItem[] => {
    // Still loading: skeleton stamp rows instead of a blank page
    if (loading) {
      return [{ type: 'header' }, { type: 'skeleton', idx: 0 }, { type: 'skeleton', idx: 1 }, { type: 'skeleton', idx: 2 }];
    }

    const rows: RowItem[] = [{ type: 'header' }];

    if (allStampItems.length === 0) {
      rows.push({ type: 'empty' });
      return rows;
    }

    for (let i = 0; i < allStampItems.length; i += 3) {
      const rowIdx = i / 3;
      // Page divider before each new page (except the first)
      if (rowIdx > 0 && rowIdx % ROWS_PER_PAGE === 0) {
        rows.push({ type: 'divider', pageNum: Math.floor(rowIdx / ROWS_PER_PAGE) + 1 });
      }
      rows.push({ type: 'stamps', rowIdx, items: allStampItems.slice(i, i + 3) });
    }

    return rows;
  }, [loading, allStampItems]);

  if (error && allParks.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: PAPER }} edges={['bottom']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <Ionicons name="cloud-offline-outline" size={36} color={C.inkMute} />
          <Text style={{ color: C.inkMute, fontSize: 15, fontWeight: '600' }}>Failed to load</Text>
          <TouchableOpacity
            onPress={() => load()}
            style={{ paddingHorizontal: 20, paddingVertical: 10, backgroundColor: C.primary, borderRadius: 12 }}
          >
            <Text style={{ color: '#FFFBF1', fontWeight: '700', fontSize: 14 }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: PAPER }} edges={['bottom']}>
      <FlatList
        data={listData}
        keyExtractor={(item, idx) => {
          if (item.type === 'header') return 'header';
          if (item.type === 'divider') return `div-${item.pageNum}`;
          if (item.type === 'empty') return 'empty';
          if (item.type === 'skeleton') return `skel-${item.idx}`;
          return `row-${item.rowIdx}`;
        }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: tabBarSpace + 16 }}
        renderItem={({ item }) => {
          if (item.type === 'header') {
            return (
              <View style={st.header}>
                {/* Wavy background */}
                <Svg
                  width="100%"
                  height="100%"
                  viewBox="0 0 360 240"
                  style={StyleSheet.absoluteFillObject}
                  preserveAspectRatio="xMidYMid slice"
                  pointerEvents="none"
                >
                  {[0, 24, 48, 72, 96, 120, 144, 168, 192, 216, 240].map((y, i) => (
                    <Path
                      key={i}
                      d={`M-20 ${y} C 40 ${y-14}, 80 ${y+14}, 120 ${y} S 200 ${y-14}, 240 ${y} S 320 ${y+14}, 380 ${y}`}
                      stroke={`rgba(201,169,74,0.07)`}
                      strokeWidth={1.5}
                      fill="none"
                    />
                  ))}
                </Svg>

                {/* Top meta */}
                <View style={st.headerMeta}>
                  <Text style={st.headerKicker}>PARKQUEST · NATIONAL PARK PASSPORT</Text>
                  <Text style={st.headerPNo}>NO · {pNo}</Text>
                </View>

                {/* Avatar + identity */}
                <View style={st.headerIdentity}>
                  <View style={st.headerAvatar}>
                    {avatarUrl ? (
                      <Image source={{ uri: avatarUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    ) : (
                      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                        {name ? (
                          <Text style={{ fontSize: 28, fontWeight: '900', color: GOLD }}>{name.slice(0,2).toUpperCase()}</Text>
                        ) : (
                          <Ionicons name="person" size={26} color={GOLD} style={{ opacity: 0.5 }} />
                        )}
                      </View>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    {name ? (
                      <Text style={st.headerName} numberOfLines={2} adjustsFontSizeToFit>{name}</Text>
                    ) : (
                      <View style={{ width: 150, height: 22, borderRadius: 6, backgroundColor: 'rgba(201,169,74,0.25)', marginBottom: 6 }} />
                    )}
                    {profile?.username ? (
                      <Text style={st.headerHandle}>@{profile.username}</Text>
                    ) : null}
                    {profile?.bio ? (
                      <Text style={st.headerBio} numberOfLines={3}>{profile.bio}</Text>
                    ) : null}
                  </View>
                </View>

                {/* Stats */}
                <View style={st.headerStats}>
                  {[
                    { label: 'PARKS',  value: loading ? '–' : `${visitedCount}/63` },
                    { label: 'STATES', value: loading ? '–' : `${statesCount}/50` },
                    { label: 'BUCKET', value: loading ? '–' : String(bucketCount) },
                    { label: 'BADGES', value: loading ? '–' : `${badgeCount}/${totalBadges}` },
                  ].map((s, i) => (
                    <View key={s.label} style={[st.headerStat, i > 0 && st.headerStatBorder]}>
                      <Text style={st.headerStatLabel}>{s.label}</Text>
                      <Text style={st.headerStatVal}>{s.value}</Text>
                    </View>
                  ))}
                </View>

                {/* Stamp count progress line */}
                <View style={st.headerProgress}>
                  <Text style={st.headerProgressText}>
                    {loading ? 'Loading…' : `${visitedCount} of 63 parks stamped`}
                  </Text>
                  <View style={st.progressTrack}>
                    <View style={[st.progressFill, { width: `${(visitedCount / 63) * 100}%` as `${number}%` }]} />
                  </View>
                </View>
              </View>
            );
          }

          if (item.type === 'divider') {
            return (
              <View style={st.pageDivider}>
                <View style={st.pageDividerLine} />
                <Text style={st.pageDividerText}>· {item.pageNum} ·</Text>
                <View style={st.pageDividerLine} />
              </View>
            );
          }

          if (item.type === 'skeleton') {
            return <SkeletonRow />;
          }

          if (item.type === 'empty') {
            return (
              <View style={{ alignItems: 'center', paddingTop: 48, paddingHorizontal: 32, gap: 10 }}>
                <Text style={{ fontSize: 32 }}>🏕</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: P_INK, textAlign: 'center' }}>No stamps yet</Text>
                <Text style={{ fontSize: 13, color: P_MUTE, textAlign: 'center', lineHeight: 19 }}>
                  Log your first park visit to earn your first stamp.
                </Text>
              </View>
            );
          }

          // stamps row
          return (
            <View style={st.stampRow}>
              {item.items.map(s => s.visited ? (
                <StampCell key={s.park_code} item={s} onPress={() => router.push(`/parks/${s.park_code}` as never)} />
              ) : (
                <StampPlaceholder key={s.park_code} item={s} />
              ))}
              {/* Pad short last row */}
              {item.items.length < 3 && Array.from({ length: 3 - item.items.length }).map((_, i) => (
                <View key={`pad-${i}`} style={{ width: CELL_W }} />
              ))}
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  // ── Header (green passport card) ──
  header: {
    backgroundColor: C.primaryDeep,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 20,
    overflow: 'hidden',
    borderBottomWidth: 3,
    borderBottomColor: GOLD + '44',
  },
  headerMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerKicker: {
    fontSize: 10,
    fontWeight: '700',
    color: GOLD,
    letterSpacing: 1.8,
    opacity: 0.8,
  },
  headerPNo: {
    fontSize: 11,
    fontWeight: '600',
    color: GOLD,
    letterSpacing: 1.2,
    opacity: 0.7,
  },
  headerIdentity: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 20,
  },
  headerAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: GOLD + '66',
    overflow: 'hidden',
    backgroundColor: C.primary,
    flexShrink: 0,
  },
  headerName: {
    fontSize: 26,
    fontWeight: '800',
    color: GOLD,
    letterSpacing: -0.5,
    lineHeight: 28,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  headerHandle: {
    fontSize: 13,
    fontWeight: '600',
    color: GOLD,
    opacity: 0.75,
    letterSpacing: 0.5,
    marginTop: 4,
  },
  headerBio: {
    fontSize: 13,
    color: '#FFFBF1',
    opacity: 0.65,
    lineHeight: 18,
    marginTop: 8,
  },
  headerStats: {
    flexDirection: 'row',
    borderTopWidth: 0.5,
    borderTopColor: GOLD + '33',
    paddingTop: 14,
    marginBottom: 16,
  },
  headerStat: {
    flex: 1,
    alignItems: 'center',
  },
  headerStatBorder: {
    borderLeftWidth: 0.5,
    borderLeftColor: GOLD + '33',
  },
  headerStatLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: GOLD,
    letterSpacing: 1.5,
    opacity: 0.7,
  },
  headerStatVal: {
    fontSize: 17,
    fontWeight: '800',
    color: GOLD,
    letterSpacing: -0.3,
    marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  headerProgress: {
    gap: 6,
  },
  headerProgressText: {
    fontSize: 11,
    fontWeight: '600',
    color: GOLD,
    opacity: 0.7,
    letterSpacing: 0.5,
  },
  progressTrack: {
    height: 3,
    backgroundColor: GOLD + '22',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: 3,
    backgroundColor: GOLD,
    borderRadius: 2,
    opacity: 0.85,
  },

  // ── Book stamp rows ──
  stampRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    backgroundColor: PAPER,
  },
  stampCell: {
    width: CELL_W,
    alignItems: 'center',
    paddingVertical: 14,
  },
  stampName: {
    fontSize: 11,
    fontWeight: '600',
    color: P_INK,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 14,
    maxWidth: CELL_W - 8,
  },
  stampDate: {
    fontSize: 10,
    color: P_MUTE,
    textAlign: 'center',
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  placeholderCircle: {
    borderWidth: 1.5,
    borderColor: P_INK,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Page divider ──
  pageDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 10,
    backgroundColor: PAPER,
  },
  pageDividerLine: {
    flex: 1,
    height: 0.5,
    backgroundColor: GOLD + '55',
  },
  pageDividerText: {
    fontSize: 10,
    fontWeight: '700',
    color: GOLD + 'AA',
    letterSpacing: 2,
  },
});
