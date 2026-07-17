import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated, Keyboard, KeyboardAvoidingView, Modal, PanResponder,
  Platform, Pressable, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
  type ColorValue,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassIconBg } from '@/components/GlassIconBg';
import { fullStateName } from '@/lib/stateNames';
import { STATIC as C, dyn, useColors } from '@/lib/palette';

const UNVISITED = '#A8A29A';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

interface ParkLite {
  park_code: string;
  name: string;
  states: string;
}

interface Visit {
  park_code: string;
  is_bucket_list: boolean;
  visited_date: string | null;
}

interface UserResult {
  clerk_user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

type ParkStatus = 'visited' | 'bucketList' | 'notVisited';
type TabFilter = 'all' | 'visited' | 'bucketList' | 'notVisited';

interface ParkWithStatus extends ParkLite {
  status: ParkStatus;
}

const STATUS_DOT: Record<ParkStatus, ColorValue> = {
  visited: C.visited,
  bucketList: C.bucket,
  notVisited: UNVISITED,
};

const TAB_DEFS: { id: TabFilter; label: string; color: ColorValue }[] = [
  { id: 'all',        label: 'All',        color: C.ink },
  { id: 'visited',    label: 'Visited',    color: C.visited },
  { id: 'bucketList', label: 'Bucket',     color: C.bucket },
  { id: 'notVisited', label: 'Not yet',    color: UNVISITED },
];

const MAX_LIST = 50;

function resolveParkStatus(code: string, visits: Visit[]): ParkStatus {
  const pv = visits.filter(v => v.park_code === code);
  if (pv.some(v => !v.is_bucket_list && v.visited_date)) return 'visited';
  if (pv.some(v => v.is_bucket_list)) return 'bucketList';
  return 'notVisited';
}

function ParkRow({ park, onPress }: { park: ParkWithStatus; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.statusDot, { backgroundColor: STATUS_DOT[park.status] }]} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{park.name}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {fullStateName(park.states.split(',')[0].trim())}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={14} color={C.inkMute} />
    </TouchableOpacity>
  );
}

export function SearchOverlay({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { getToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const T = useColors();

  const [query, setQuery]             = useState('');
  const [tab, setTab]                 = useState<TabFilter>('all');
  const [parks, setParks]             = useState<ParkLite[]>([]);
  const [visits, setVisits]           = useState<Visit[]>([]);
  const [userResults, setUserResults] = useState<UserResult[]>([]);
  const [searching, setSearching]     = useState(false);

  const parksLoaded = useRef(false);
  const timer       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq         = useRef(0);
  const inputRef    = useRef<TextInput>(null);

  // ── Animation — slides DOWN from top ──────────────────────────────────────
  const dragY = useRef(new Animated.Value(-800)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const animateIn = useCallback(() => {
    Animated.parallel([
      Animated.spring(dragY, { toValue: 0, useNativeDriver: true, bounciness: 3, speed: 14 }),
      Animated.timing(backdropOpacity, { toValue: 1, duration: 240, useNativeDriver: true }),
    ]).start(() => setTimeout(() => inputRef.current?.focus(), 80));
  }, [dragY, backdropOpacity]);

  const dismiss = useCallback(() => {
    Keyboard.dismiss();
    Animated.parallel([
      Animated.timing(dragY, { toValue: -800, duration: 220, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      onClose();
    });
  }, [dragY, backdropOpacity, onClose]);

  // Swipe UP to dismiss (dy negative = moving toward top)
  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, { dy }) => dy < -6,
    onPanResponderMove: (_, { dy }) => { if (dy < 0) dragY.setValue(dy); },
    onPanResponderRelease: (_, { dy, vy }) => {
      if (dy < -80 || vy < -0.8) {
        Keyboard.dismiss();
        Animated.parallel([
          Animated.timing(dragY, { toValue: -800, duration: 220, useNativeDriver: true }),
          Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]).start(() => onClose());
      } else {
        Animated.spring(dragY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
      }
    },
  })).current;

  useEffect(() => {
    if (visible) {
      dragY.setValue(-800);
      backdropOpacity.setValue(0);
      animateIn();
    }
  }, [visible, dragY, backdropOpacity, animateIn]);

  // ── Data loading ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    (async () => {
      const tok = await getToken();
      if (!tok) return;
      const headers = { Authorization: `Bearer ${tok}` };
      try {
        const [parksRes, visitsRes] = await Promise.all([
          parksLoaded.current ? null : fetch(`${BASE}/api/parks`, { headers }),
          fetch(`${BASE}/api/visits`, { headers }),
        ]);
        if (parksRes?.ok) {
          const data: ParkLite[] = await parksRes.json();
          setParks(data.map(p => ({ park_code: p.park_code, name: p.name, states: p.states })));
          parksLoaded.current = true;
        }
        if (visitsRes.ok) setVisits(await visitsRes.json());
      } catch { /* ignore */ }
    })();
  }, [visible, getToken]);

  const searchUsers = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) { setUserResults([]); return; }
    const mySeq = ++seq.current;
    const tok = await getToken();
    if (!tok) { setSearching(false); return; }
    try {
      const res = await fetch(
        `${BASE}/api/users?q=${encodeURIComponent(trimmed)}&limit=5`,
        { headers: { Authorization: `Bearer ${tok}` } }
      );
      if (res.ok) {
        const data: UserResult[] = await res.json();
        if (mySeq === seq.current) { setUserResults(data.slice(0, 5)); setSearching(false); }
      } else if (mySeq === seq.current) { setSearching(false); }
    } catch { if (mySeq === seq.current) setSearching(false); }
  }, [getToken]);

  const handleChange = (q: string) => {
    setQuery(q);
    if (timer.current) clearTimeout(timer.current);
    if (!q.trim()) { setUserResults([]); setSearching(false); return; }
    setSearching(true);
    timer.current = setTimeout(() => searchUsers(q), 250);
  };

  const close = () => {
    if (timer.current) clearTimeout(timer.current);
    setQuery('');
    setTab('all');
    setUserResults([]);
    setSearching(false);
    dismiss();
  };

  const openPark = (code: string) => {
    close();
    router.push(`/parks/${code}` as never);
  };

  const openUser = (id: string) => {
    close();
    router.push(`/user/${id}` as never);
  };

  const trimmedQuery = query.trim().toLowerCase();

  const parksWithStatus: ParkWithStatus[] = parks.map(p => ({
    ...p,
    status: resolveParkStatus(p.park_code, visits),
  }));

  const filteredParks = parksWithStatus.filter(p => {
    if (tab !== 'all' && p.status !== tab) return false;
    if (!trimmedQuery) return true;
    const stateStr = p.states.split(',').map(s => fullStateName(s.trim())).join(' ');
    return `${p.name} ${p.states} ${stateStr}`.toLowerCase().includes(trimmedQuery);
  });

  const latestVisitDate = (code: string) =>
    visits
      .filter(v => v.park_code === code && !v.is_bucket_list && v.visited_date)
      .map(v => v.visited_date!)
      .sort()
      .reverse()[0] ?? '';

  const suggestions =
    !trimmedQuery && tab === 'all'
      ? {
          recent: parksWithStatus
            .filter(p => p.status === 'visited')
            .sort((a, b) => latestVisitDate(b.park_code).localeCompare(latestVisitDate(a.park_code)))
            .slice(0, 5),
          bucket: parksWithStatus.filter(p => p.status === 'bucketList').slice(0, 5),
          discover: parksWithStatus.filter(p => p.status === 'notVisited').slice(0, 5),
        }
      : null;

  const showUsers   = trimmedQuery.length > 0 && userResults.length > 0;
  const noResults   = trimmedQuery.length > 0 && !searching && filteredParks.length === 0 && userResults.length === 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={close}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={{ flex: 1, justifyContent: 'flex-start' }}>
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.35)', opacity: backdropOpacity }]} pointerEvents="none" />
          <Pressable style={StyleSheet.absoluteFill} onPress={close} />

          <Animated.View
            style={[styles.sheet, { paddingTop: insets.top + 6, transform: [{ translateY: dragY }] }]}
          >
            {/* Header */}
            <View style={styles.header} {...panResponder.panHandlers}>
              <View>
                <Text style={styles.title}>Search</Text>
              </View>
              <TouchableOpacity onPress={close} style={styles.closeBtn} hitSlop={8}>
                <GlassIconBg />
                <Ionicons name="close" size={22} color={C.inkSoft} />
              </TouchableOpacity>
            </View>

            {/* Search input */}
            <View style={styles.searchWrap}>
              <View style={styles.searchBar}>
                <Ionicons name="search" size={16} color={C.inkMute} />
                <TextInput
                  ref={inputRef}
                  style={styles.searchInput}
                  value={query}
                  onChangeText={handleChange}
                  placeholder="Parks, states, or users…"
                  placeholderTextColor={C.inkMute}
                  autoCorrect={false}
                  autoCapitalize="none"
                  returnKeyType="search"
                />
                {query.length > 0 && (
                  <TouchableOpacity onPress={() => handleChange('')} hitSlop={8}>
                    <Ionicons name="close-circle" size={16} color={C.inkMute} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Filter tabs */}
            <View style={styles.tabRow}>
              {TAB_DEFS.map(f => {
                const active = tab === f.id;
                return (
                  <TouchableOpacity
                    key={f.id}
                    style={[styles.tabChip, active && { backgroundColor: T.primary }]}
                    onPress={() => setTab(f.id)}
                    activeOpacity={0.7}
                  >
                    {!active && <View style={[styles.tabDot, { backgroundColor: f.color }]} />}
                    <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{f.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Results */}
            <ScrollView
              style={styles.resultsScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {showUsers && (
                <>
                  <Text style={styles.sectionTitle}>USERS</Text>
                  {userResults.map(u => (
                    <TouchableOpacity
                      key={u.clerk_user_id}
                      style={styles.row}
                      onPress={() => openUser(u.clerk_user_id)}
                      activeOpacity={0.7}
                    >
                      {u.avatar_url ? (
                        <Image source={{ uri: u.avatar_url }} style={styles.rowAvatar} />
                      ) : (
                        <View style={styles.rowIcon}>
                          <Ionicons name="person" size={14} color={C.inkMute} />
                        </View>
                      )}
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.rowTitle} numberOfLines={1}>
                          {u.display_name ?? (u.username ? `@${u.username}` : 'User')}
                        </Text>
                        {u.display_name && u.username ? (
                          <Text style={styles.rowSub} numberOfLines={1}>@{u.username}</Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  ))}
                </>
              )}

              {suggestions ? (
                <>
                  {suggestions.recent.length > 0 && (
                    <>
                      <Text style={styles.sectionTitle}>RECENTLY VISITED</Text>
                      {suggestions.recent.map(p => (
                        <ParkRow key={p.park_code} park={p} onPress={() => openPark(p.park_code)} />
                      ))}
                    </>
                  )}
                  {suggestions.bucket.length > 0 && (
                    <>
                      <Text style={styles.sectionTitle}>ON YOUR BUCKET LIST</Text>
                      {suggestions.bucket.map(p => (
                        <ParkRow key={p.park_code} park={p} onPress={() => openPark(p.park_code)} />
                      ))}
                    </>
                  )}
                  {suggestions.discover.length > 0 && (
                    <>
                      <Text style={styles.sectionTitle}>DISCOVER</Text>
                      {suggestions.discover.map(p => (
                        <ParkRow key={p.park_code} park={p} onPress={() => openPark(p.park_code)} />
                      ))}
                    </>
                  )}
                </>
              ) : filteredParks.length > 0 ? (
                <>
                  <Text style={styles.sectionTitle}>
                    {filteredParks.length} PARK{filteredParks.length !== 1 ? 'S' : ''}
                  </Text>
                  {filteredParks.slice(0, MAX_LIST).map(p => (
                    <ParkRow key={p.park_code} park={p} onPress={() => openPark(p.park_code)} />
                  ))}
                </>
              ) : noResults ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyEmoji}>🔍</Text>
                  <Text style={styles.emptyTitle}>No results</Text>
                  <Text style={styles.emptyMuted}>Nothing matched &ldquo;{query.trim()}&rdquo;.</Text>
                </View>
              ) : null}
              <View style={{ height: 8 }} />
            </ScrollView>

            {/* Drag handle at bottom — swipe up to dismiss */}
            <View style={styles.dragHandle} {...panResponder.panHandlers}>
              <View style={styles.dragIndicator} />
            </View>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: C.surface,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    borderWidth: 0.5,
    borderTopWidth: 0,
    borderColor: C.hairline,
    overflow: 'hidden',
    maxHeight: '88%',
  },

  dragHandle: {
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 10,
  },
  dragIndicator: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: dyn('rgba(27,26,22,0.15)', 'rgba(240,234,217,0.20)'),
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: C.hairlineSoft,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: C.ink,
    letterSpacing: -0.3,
  },
  // Matches the header icon buttons (44pt Liquid Glass circle) — GlassIconBg
  // needs overflow hidden and no backgroundColor of its own.
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: C.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },

  searchWrap: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.surfaceAlt,
    borderWidth: 0.5,
    borderColor: C.hairline,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: C.ink,
    padding: 0,
  },

  tabRow: {
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  tabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 100,
    backgroundColor: C.surfaceAlt,
    borderWidth: 0.5,
    borderColor: C.hairline,
  },
  tabDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: C.inkSoft,
  },
  tabLabelActive: {
    color: C.onPrimary,
    fontWeight: '700',
  },

  resultsScroll: {
    maxHeight: 420,
    borderTopWidth: 0.5,
    borderTopColor: C.hairlineSoft,
  },

  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: C.inkMute,
    letterSpacing: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  rowTitle: {
    fontSize: 13.5,
    fontWeight: '600',
    color: C.ink,
  },
  rowSub: {
    fontSize: 13,
    color: C.inkMute,
    marginTop: 1,
  },

  emptyBox: {
    paddingVertical: 48,
    alignItems: 'center',
    gap: 6,
  },
  emptyEmoji: {
    fontSize: 34,
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: C.ink,
    letterSpacing: -0.2,
  },
  emptyMuted: {
    fontSize: 13,
    color: C.inkMute,
    textAlign: 'center',
  },
});
