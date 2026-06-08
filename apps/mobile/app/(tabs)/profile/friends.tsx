import {
  ActivityIndicator, Alert, Image, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';

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
  primaryDeep:'#152A20',
  accent:     '#C56B3D',
  visited:    '#2F7A4A',
};

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserBase {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  parks_visited?: number;
}

interface FriendUser extends UserBase {
  friendship_id?: string;
}

interface PendingUser extends UserBase {
  friendship_id: string;
}

interface SuggestedUser extends UserBase {
  mutual_friends?: number;
}

type FriendAction = 'add' | 'cancel' | 'accept' | 'decline' | 'remove';

// ── Helpers ───────────────────────────────────────────────────────────────────

function nameOf(u: UserBase) {
  return u.display_name || u.username;
}

function initials(u: UserBase): string {
  const n = nameOf(u);
  const parts = n.split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return n.slice(0, 2).toUpperCase();
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ user, size = 44 }: { user: UserBase; size?: number }) {
  const r = size / 2;
  return (
    <View style={{ width: size, height: size, borderRadius: r, overflow: 'hidden', backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}>
      {user.avatar_url ? (
        <Image source={{ uri: user.avatar_url }} style={{ width: size, height: size }} resizeMode="cover" />
      ) : (
        <Text style={{ fontSize: size * 0.33, fontWeight: '900', color: '#FFFBF1' }}>{initials(user)}</Text>
      )}
    </View>
  );
}

// ── User row ──────────────────────────────────────────────────────────────────

type RowVariant = 'friend' | 'pending_incoming' | 'pending_outgoing' | 'suggested' | 'search_result';

interface UserRowProps {
  user: UserBase;
  variant: RowVariant;
  onAction: (action: FriendAction, user: UserBase) => void;
  loading?: boolean;
}

function UserRow({ user, variant, onAction, loading }: UserRowProps) {
  const sub = user.parks_visited != null
    ? `${user.parks_visited} park${user.parks_visited !== 1 ? 's' : ''} visited`
    : (user as SuggestedUser).mutual_friends
      ? `${(user as SuggestedUser).mutual_friends} mutual friend${(user as SuggestedUser).mutual_friends !== 1 ? 's' : ''}`
      : null;

  return (
    <View style={styles.row}>
      <Avatar user={user} size={44} />
      <View style={{ flex: 1, marginLeft: 12, gap: 1 }}>
        <Text style={styles.rowName}>{nameOf(user)}</Text>
        <Text style={styles.rowHandle}>@{user.username}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 7 }}>
        {variant === 'friend' && (
          <TouchableOpacity
            onPress={() => {
              Alert.alert(
                'Remove friend',
                `Remove ${nameOf(user)} from your friends?`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Remove', style: 'destructive', onPress: () => onAction('remove', user) },
                ]
              );
            }}
            disabled={loading}
            style={[styles.btn, styles.btnSecondary]}
          >
            <Text style={styles.btnSecondaryText}>Remove</Text>
          </TouchableOpacity>
        )}
        {variant === 'pending_incoming' && (
          <>
            <TouchableOpacity onPress={() => onAction('decline', user)} disabled={loading} style={[styles.btn, styles.btnSecondary]}>
              <Text style={styles.btnSecondaryText}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onAction('accept', user)} disabled={loading} style={[styles.btn, styles.btnPrimary]}>
              {loading ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.btnPrimaryText}>Accept</Text>}
            </TouchableOpacity>
          </>
        )}
        {variant === 'pending_outgoing' && (
          <TouchableOpacity onPress={() => onAction('cancel', user)} disabled={loading} style={[styles.btn, styles.btnSecondary]}>
            <Text style={styles.btnSecondaryText}>Sent ›</Text>
          </TouchableOpacity>
        )}
        {(variant === 'suggested' || variant === 'search_result') && (
          <TouchableOpacity onPress={() => onAction('add', user)} disabled={loading} style={[styles.btn, styles.btnPrimary]}>
            {loading ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.btnPrimaryText}>+ Add</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHead({ label, count }: { label: string; count?: number }) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {count != null && <Text style={styles.sectionCount}>{count}</Text>}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function FriendsScreen() {
  const { getToken } = useAuth();

  const [friends,    setFriends]    = useState<FriendUser[]>([]);
  const [incoming,   setIncoming]   = useState<PendingUser[]>([]);
  const [outgoing,   setOutgoing]   = useState<PendingUser[]>([]);
  const [suggested,  setSuggested]  = useState<SuggestedUser[]>([]);
  const [loading,    setLoading]    = useState(true);

  const [searchQ,    setSearchQ]    = useState('');
  const [results,    setResults]    = useState<UserBase[]>([]);
  const [searching,  setSearching]  = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const [actionId,   setActionId]   = useState<string | null>(null);

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load all friend data ───────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    const tok = await getToken();
    if (!tok) return;
    const h = { Authorization: `Bearer ${tok}` };

    const [fr, inc, out, sug] = await Promise.allSettled([
      fetch(`${BASE}/api/friends?type=friends`, { headers: h }).then(r => r.ok ? r.json() : []),
      fetch(`${BASE}/api/friends?type=pending_incoming`, { headers: h }).then(r => r.ok ? r.json() : []),
      fetch(`${BASE}/api/friends?type=pending_outgoing`, { headers: h }).then(r => r.ok ? r.json() : []),
      fetch(`${BASE}/api/users/suggestions?limit=8`, { headers: h }).then(r => r.ok ? r.json() : []),
    ]);

    if (fr.status  === 'fulfilled') setFriends(fr.value   ?? []);
    if (inc.status === 'fulfilled') setIncoming(inc.value ?? []);
    if (out.status === 'fulfilled') setOutgoing(out.value ?? []);
    if (sug.status === 'fulfilled') setSuggested(sug.value ?? []);
    setLoading(false);
  }, [getToken]);

  useFocusEffect(useCallback(() => { loadAll(); }, [loadAll]));

  // ── Search ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!searchQ.trim()) { setResults([]); setSearchOpen(false); return; }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setSearching(true);
      setSearchOpen(true);
      try {
        const tok = await getToken();
        if (!tok) return;
        const r = await fetch(`${BASE}/api/users?search=${encodeURIComponent(searchQ.trim())}&limit=12`, {
          headers: { Authorization: `Bearer ${tok}` },
        });
        const data = r.ok ? await r.json() : [];
        const friendIds = new Set(friends.map(f => f.id));
        const inIds = new Set(incoming.map(u => u.id));
        const outIds = new Set(outgoing.map(u => u.id));
        setResults(
          (data as UserBase[]).filter(u => !friendIds.has(u.id) && !inIds.has(u.id) && !outIds.has(u.id))
        );
      } catch (e) {
        console.error('search error', e);
      } finally {
        setSearching(false);
      }
    }, 320);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [searchQ, getToken, friends, incoming, outgoing]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleAction = useCallback(async (action: FriendAction, user: UserBase) => {
    const tok = await getToken();
    if (!tok) return;
    setActionId(user.id);
    try {
      if (action === 'add') {
        await fetch(`${BASE}/api/friends`, {
          method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id }),
        });
        setSuggested(s => s.filter(u => u.id !== user.id));
        setResults(r => r.filter(u => u.id !== user.id));
      } else if (action === 'accept') {
        await fetch(`${BASE}/api/friends`, {
          method: 'PATCH', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, action: 'accept' }),
        });
        const accepted = incoming.find(u => u.id === user.id);
        setIncoming(s => s.filter(u => u.id !== user.id));
        if (accepted) setFriends(s => [accepted, ...s]);
      } else if (action === 'decline') {
        await fetch(`${BASE}/api/friends`, {
          method: 'PATCH', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, action: 'decline' }),
        });
        setIncoming(s => s.filter(u => u.id !== user.id));
      } else if (action === 'cancel') {
        await fetch(`${BASE}/api/friends?userId=${user.id}`, {
          method: 'DELETE', headers: { Authorization: `Bearer ${tok}` },
        });
        setOutgoing(s => s.filter(u => u.id !== user.id));
      } else if (action === 'remove') {
        await fetch(`${BASE}/api/friends?userId=${user.id}`, {
          method: 'DELETE', headers: { Authorization: `Bearer ${tok}` },
        });
        setFriends(s => s.filter(u => u.id !== user.id));
      }
    } catch (e) {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setActionId(null);
    }
  }, [getToken, incoming]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }} edges={['bottom']}>
        <ActivityIndicator size="large" color={C.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>

        {/* Header */}
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>Friends</Text>
          <Text style={styles.pageSub}>
            {friends.length} friend{friends.length !== 1 ? 's' : ''} · {incoming.length > 0 ? `${incoming.length} pending` : 'no pending requests'}
          </Text>
        </View>

        {/* Search bar */}
        <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={16} color={C.inkMute} />
            <TextInput
              placeholder="Search by username or name"
              placeholderTextColor={C.inkMute}
              style={styles.searchInput}
              value={searchQ}
              onChangeText={setSearchQ}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
            {searching && <ActivityIndicator size="small" color={C.inkMute} />}
          </View>

          {/* Search results dropdown */}
          {searchOpen && searchQ.trim().length > 0 && (
            <View style={styles.searchDrop}>
              {results.length === 0 && !searching ? (
                <View style={{ padding: 16, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: C.inkMute }}>No users found for "{searchQ}"</Text>
                </View>
              ) : (
                results.map(u => (
                  <UserRow
                    key={u.id} user={u} variant="search_result"
                    onAction={handleAction}
                    loading={actionId === u.id}
                  />
                ))
              )}
            </View>
          )}
        </View>

        {/* Pending incoming */}
        {incoming.length > 0 && (
          <View style={[styles.section, { borderLeftWidth: 3, borderLeftColor: C.accent, marginHorizontal: 16 }]}>
            <SectionHead label="FRIEND REQUESTS" count={incoming.length} />
            {incoming.map(u => (
              <UserRow key={u.id} user={u} variant="pending_incoming" onAction={handleAction} loading={actionId === u.id} />
            ))}
          </View>
        )}

        {/* Friends list */}
        {friends.length > 0 ? (
          <View style={[styles.section, { marginHorizontal: 16 }]}>
            <SectionHead label="MY FRIENDS" count={friends.length} />
            {friends.map(u => (
              <UserRow key={u.id} user={u} variant="friend" onAction={handleAction} loading={actionId === u.id} />
            ))}
          </View>
        ) : (
          <View style={{ paddingHorizontal: 16, marginBottom: 20 }}>
            <View style={styles.emptyCard}>
              <Text style={{ fontSize: 28, marginBottom: 8 }}>🏕</Text>
              <Text style={{ fontSize: 15, fontWeight: '700', color: C.ink }}>No friends yet</Text>
              <Text style={{ fontSize: 13, color: C.inkMute, textAlign: 'center', marginTop: 6, lineHeight: 18 }}>
                Search above or check out the suggestions below.
              </Text>
            </View>
          </View>
        )}

        {/* People you may know */}
        {suggested.length > 0 && (
          <View style={[styles.section, { marginHorizontal: 16 }]}>
            <SectionHead label="PEOPLE YOU MAY KNOW" />
            {suggested.map(u => (
              <UserRow key={u.id} user={u} variant="suggested" onAction={handleAction} loading={actionId === u.id} />
            ))}
          </View>
        )}

        {/* Sent requests */}
        {outgoing.length > 0 && (
          <View style={[styles.section, { marginHorizontal: 16 }]}>
            <SectionHead label="SENT REQUESTS" count={outgoing.length} />
            {outgoing.map(u => (
              <UserRow key={u.id} user={u} variant="pending_outgoing" onAction={handleAction} loading={actionId === u.id} />
            ))}
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },

  pageHeader: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 18 },
  pageTitle:  { fontSize: 26, fontWeight: '900', color: C.ink, letterSpacing: -0.5 },
  pageSub:    { fontSize: 13, color: C.inkMute, marginTop: 3 },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.surface, borderRadius: 12,
    borderWidth: 1, borderColor: C.hairline,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  searchInput: {
    flex: 1, fontSize: 14, color: C.ink,
  },
  searchDrop: {
    backgroundColor: C.surface, borderRadius: 12,
    borderWidth: 1, borderColor: C.hairline,
    marginTop: 6,
    shadowColor: C.ink, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 4,
    overflow: 'hidden',
  },

  section: {
    backgroundColor: C.surface, borderRadius: 14,
    borderWidth: 1, borderColor: C.hairline,
    overflow: 'hidden', marginBottom: 16,
  },
  sectionHead: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8,
    borderBottomWidth: 0.5, borderBottomColor: C.hairline,
  },
  sectionLabel: {
    fontSize: 10, fontWeight: '700', color: C.inkMute, letterSpacing: 1.3,
  },
  sectionCount: {
    fontSize: 10, fontWeight: '800', color: C.surface,
    backgroundColor: C.inkMute, borderRadius: 10,
    paddingHorizontal: 5, paddingVertical: 1.5,
    overflow: 'hidden',
  },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 0.5, borderBottomColor: C.hairline,
  },
  rowName:   { fontSize: 14, fontWeight: '700', color: C.ink },
  rowHandle: { fontSize: 12, color: C.inkMute },
  rowSub:    { fontSize: 11, color: C.inkMute },

  btn: {
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
    minWidth: 60, alignItems: 'center', justifyContent: 'center',
  },
  btnPrimary:     { backgroundColor: C.primary },
  btnPrimaryText: { fontSize: 12, fontWeight: '700', color: '#FFFBF1' },
  btnSecondary:   { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.hairline },
  btnSecondaryText: { fontSize: 12, fontWeight: '600', color: C.inkSoft },

  emptyCard: {
    backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.hairline,
    padding: 28, alignItems: 'center',
  },
});
