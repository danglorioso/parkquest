import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Keyboard, Modal, Pressable, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { fullStateName } from '@/lib/stateNames';

const C = {
  surface:  '#FFFBF1',
  surfaceAlt: '#F7F0DE',
  ink:      '#1B1A16',
  inkSoft:  '#3C3A33',
  inkMute:  '#7A746A',
  hairline: 'rgba(27,26,22,0.10)',
  hairlineSoft: 'rgba(27,26,22,0.06)',
  visited:  '#2F7A4A',
  bucket:   '#D89A3A',
  unvisited:'#A8A29A',
};

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

const STATUS_DOT: Record<ParkStatus, string> = {
  visited: C.visited,
  bucketList: C.bucket,
  notVisited: C.unvisited,
};

const TAB_DEFS: { id: TabFilter; label: string; color: string }[] = [
  { id: 'all',        label: 'All',     color: C.ink },
  { id: 'visited',    label: 'Visited', color: C.visited },
  { id: 'bucketList', label: 'Bucket',  color: C.bucket },
  { id: 'notVisited', label: 'Not yet', color: C.unvisited },
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

  const [query, setQuery]           = useState('');
  const [tab, setTab]               = useState<TabFilter>('all');
  const [parks, setParks]           = useState<ParkLite[]>([]);
  const [visits, setVisits]         = useState<Visit[]>([]);
  const [userResults, setUserResults] = useState<UserResult[]>([]);
  const parksLoaded = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);
  const inputRef = useRef<TextInput>(null);

  // Parks load once; visits refresh on each open so statuses stay current
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

  useEffect(() => {
    if (visible) setTimeout(() => inputRef.current?.focus(), 100);
  }, [visible]);

  const searchUsers = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) { setUserResults([]); return; }
    const mySeq = ++seq.current;
    const tok = await getToken();
    if (!tok) return;
    try {
      const res = await fetch(
        `${BASE}/api/users?q=${encodeURIComponent(trimmed)}&limit=5`,
        { headers: { Authorization: `Bearer ${tok}` } }
      );
      if (res.ok) {
        const data: UserResult[] = await res.json();
        if (mySeq === seq.current) setUserResults(data.slice(0, 5));
      }
    } catch { /* ignore */ }
  }, [getToken]);

  const handleChange = (q: string) => {
    setQuery(q);
    if (timer.current) clearTimeout(timer.current);
    if (!q.trim()) { setUserResults([]); return; }
    timer.current = setTimeout(() => searchUsers(q), 250);
  };

  const close = () => {
    if (timer.current) clearTimeout(timer.current);
    setQuery('');
    setTab('all');
    setUserResults([]);
    Keyboard.dismiss();
    onClose();
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

  const showUsers = trimmedQuery.length > 0 && userResults.length > 0;
  const noResults = trimmedQuery.length > 0 && filteredParks.length === 0 && userResults.length === 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} />

      <View style={[styles.wrap, { top: insets.top + 12 }]}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={16} color={C.inkMute} />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            value={query}
            onChangeText={handleChange}
            placeholder="Search parks or users…"
            placeholderTextColor={C.inkMute}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
          <TouchableOpacity onPress={close} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={C.inkMute} />
          </TouchableOpacity>
        </View>

        <View style={styles.results}>
          <View style={styles.tabRow}>
            {TAB_DEFS.map(f => {
              const active = tab === f.id;
              return (
                <TouchableOpacity
                  key={f.id}
                  style={[styles.tabChip, active && styles.tabChipActive]}
                  onPress={() => setTab(f.id)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.tabDot, { backgroundColor: f.color }]} />
                  <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{f.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <ScrollView style={styles.resultsScroll} keyboardShouldPersistTaps="handled">
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
              <Text style={styles.emptyText}>No results for &ldquo;{query.trim()}&rdquo;.</Text>
            ) : null}
            <View style={{ height: 6 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(27,26,22,0.35)',
  },
  wrap: {
    position: 'absolute',
    left: 14,
    right: 14,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.surface,
    borderWidth: 0.5,
    borderColor: C.hairline,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: C.ink,
    padding: 0,
  },
  results: {
    marginTop: 6,
    backgroundColor: C.surface,
    borderWidth: 0.5,
    borderColor: C.hairline,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  resultsScroll: {
    maxHeight: 420,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: C.hairlineSoft,
  },
  tabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  tabChipActive: {
    backgroundColor: 'rgba(31,61,46,0.06)',
  },
  tabDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tabLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    color: C.inkSoft,
  },
  tabLabelActive: {
    fontWeight: '700',
    color: C.ink,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: C.inkMute,
    letterSpacing: 0.8,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: C.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  rowTitle: {
    fontSize: 13.5,
    fontWeight: '600',
    color: C.ink,
  },
  rowSub: {
    fontSize: 11.5,
    color: C.inkMute,
    marginTop: 1,
  },
  emptyText: {
    paddingVertical: 36,
    textAlign: 'center',
    fontSize: 13,
    color: C.inkMute,
  },
});
