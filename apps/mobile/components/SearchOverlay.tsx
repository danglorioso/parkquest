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
  inkMute:  '#7A746A',
  hairline: 'rgba(27,26,22,0.10)',
  visited:  '#2F7A4A',
};

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

interface ParkLite {
  park_code: string;
  name: string;
  states: string;
}

interface UserResult {
  clerk_user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export function SearchOverlay({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { getToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [query, setQuery]             = useState('');
  const [parkResults, setParkResults] = useState<ParkLite[]>([]);
  const [userResults, setUserResults] = useState<UserResult[]>([]);
  const parksRef = useRef<ParkLite[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);
  const inputRef = useRef<TextInput>(null);

  // Load the parks list once, the first time the overlay opens
  useEffect(() => {
    if (!visible || parksRef.current.length > 0) return;
    (async () => {
      const tok = await getToken();
      if (!tok) return;
      try {
        const res = await fetch(`${BASE}/api/parks`, { headers: { Authorization: `Bearer ${tok}` } });
        if (res.ok) {
          const data: ParkLite[] = await res.json();
          parksRef.current = data.map(p => ({ park_code: p.park_code, name: p.name, states: p.states }));
        }
      } catch { /* ignore */ }
    })();
  }, [visible, getToken]);

  useEffect(() => {
    if (visible) setTimeout(() => inputRef.current?.focus(), 100);
  }, [visible]);

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) { setParkResults([]); setUserResults([]); return; }
    const mySeq = ++seq.current;
    const lower = trimmed.toLowerCase();
    const matchedParks = parksRef.current.filter(p =>
      p.name.toLowerCase().includes(lower) ||
      p.states.toLowerCase().includes(lower) ||
      fullStateName(p.states.split(',')[0].trim()).toLowerCase().includes(lower)
    ).slice(0, 5);
    let matchedUsers: UserResult[] = [];
    const tok = await getToken();
    if (tok) {
      try {
        const res = await fetch(
          `${BASE}/api/users?q=${encodeURIComponent(trimmed)}&limit=5`,
          { headers: { Authorization: `Bearer ${tok}` } }
        );
        if (res.ok) matchedUsers = await res.json();
      } catch { /* ignore */ }
    }
    if (mySeq !== seq.current) return;
    setParkResults(matchedParks);
    setUserResults(matchedUsers.slice(0, 5));
  }, [getToken]);

  const handleChange = (q: string) => {
    setQuery(q);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => runSearch(q), 250);
  };

  const close = () => {
    if (timer.current) clearTimeout(timer.current);
    setQuery('');
    setParkResults([]);
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

  const hasResults = parkResults.length > 0 || userResults.length > 0;

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

        {hasResults && (
          <ScrollView style={styles.results} keyboardShouldPersistTaps="handled">
            {parkResults.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>PARKS</Text>
                {parkResults.map(p => (
                  <TouchableOpacity
                    key={p.park_code}
                    style={styles.row}
                    onPress={() => openPark(p.park_code)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.rowIcon}>
                      <Ionicons name="location" size={15} color={C.visited} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{p.name}</Text>
                      <Text style={styles.rowSub} numberOfLines={1}>{p.states}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </>
            )}
            {userResults.length > 0 && (
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
            <View style={{ height: 6 }} />
          </ScrollView>
        )}
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
    maxHeight: 420,
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
});
