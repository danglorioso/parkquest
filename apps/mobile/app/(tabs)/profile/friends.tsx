import {
  ActivityIndicator, Alert, FlatList, Image, Platform,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
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
  danger:     '#DC2626',
};

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

// ── Types ─────────────────────────────────────────────────────────────────────

interface FriendUser {
  clerk_user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  friends_since: string | null;
}

interface PendingUser {
  friendship_id: number;
  clerk_user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  requested_at: string | null;
}

interface SuggestedUser {
  clerk_user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  mutual_friends: number;
  shared_parks: number;
  visit_count: number;
}

interface SearchUser {
  clerk_user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

// ── List row types ─────────────────────────────────────────────────────────────

type ListRow =
  | { _t: 'header' }
  | { _t: 'searchbar' }
  | { _t: 'search_results'; results: SearchUser[] }
  | { _t: 'section'; label: string; icon: string; count?: number; accent?: boolean }
  | { _t: 'friend';    item: FriendUser }
  | { _t: 'incoming';  item: PendingUser }
  | { _t: 'outgoing';  item: PendingUser }
  | { _t: 'suggested'; item: SuggestedUser }
  | { _t: 'skeleton' }
  | { _t: 'empty';    message: string };

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid(u: { clerk_user_id?: string; id?: string }): string {
  return u.clerk_user_id ?? u.id ?? '';
}

function displayName(u: { display_name: string | null; username: string | null | undefined }): string {
  return u.display_name ?? u.username ?? 'Explorer';
}

function initials(name: string): string {
  const parts = name.trim().split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ url, name, size = 44 }: { url: string | null; name: string; size?: number }) {
  const r = size / 2;
  return (
    <View style={{ width: size, height: size, borderRadius: r, overflow: 'hidden', flexShrink: 0 }}>
      {url ? (
        <Image source={{ uri: url }} style={{ width: size, height: size }} resizeMode="cover" />
      ) : (
        <View style={{ flex: 1, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: size * 0.33, fontWeight: '900', color: '#FFFBF1' }}>
            {initials(name)}
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Skeleton row ──────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <View style={[st.row, { borderBottomWidth: 0.5, borderBottomColor: C.hairline }]}>
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.surfaceAlt, flexShrink: 0 }} />
      <View style={{ flex: 1, marginLeft: 14, gap: 7 }}>
        <View style={{ height: 13, width: '55%', backgroundColor: C.surfaceAlt, borderRadius: 4 }} />
        <View style={{ height: 11, width: '35%', backgroundColor: C.surfaceAlt, borderRadius: 3 }} />
      </View>
      <View style={{ height: 32, width: 80, backgroundColor: C.surfaceAlt, borderRadius: 8, flexShrink: 0 }} />
    </View>
  );
}

// ── Section head ──────────────────────────────────────────────────────────────

function SectionHead({ label, icon, count, accent }: { label: string; icon: string; count?: number; accent?: boolean }) {
  return (
    <View style={st.sectionHead}>
      <Ionicons name={icon as any} size={13} color={C.inkMute} />
      <Text style={st.sectionLabel}>{label}</Text>
      {count != null && count > 0 && (
        <View style={[st.badge, accent && { backgroundColor: C.danger }]}>
          <Text style={st.badgeText}>{count}</Text>
        </View>
      )}
    </View>
  );
}

// ── User row ──────────────────────────────────────────────────────────────────

interface ActionState {
  busy: boolean;
  sent: boolean;
}

function FriendRow({
  avatarUrl, name, username, subtext, busy, onUnfriend,
}: {
  avatarUrl: string | null; name: string; username: string; subtext?: string;
  busy: boolean; onUnfriend: () => void;
}) {
  return (
    <View style={st.row}>
      <Avatar url={avatarUrl} name={name} />
      <View style={{ flex: 1, marginLeft: 14, minWidth: 0 }}>
        <Text style={st.rowName} numberOfLines={1}>{name}</Text>
        <Text style={st.rowHandle}>@{username}</Text>
        {subtext ? <Text style={st.rowSub}>{subtext}</Text> : null}
      </View>
      <TouchableOpacity
        onPress={onUnfriend} disabled={busy}
        style={[st.btn, st.btnSecondary, busy && { opacity: 0.5 }]}
      >
        <Ionicons name="person-remove-outline" size={12} color={C.inkSoft} style={{ marginRight: 4 }} />
        <Text style={st.btnSecondaryText}>Unfriend</Text>
      </TouchableOpacity>
    </View>
  );
}

function IncomingRow({
  avatarUrl, name, username, busy, onAccept, onDecline,
}: {
  avatarUrl: string | null; name: string; username: string;
  busy: boolean; onAccept: () => void; onDecline: () => void;
}) {
  return (
    <View style={st.row}>
      <Avatar url={avatarUrl} name={name} />
      <View style={{ flex: 1, marginLeft: 14, minWidth: 0 }}>
        <Text style={st.rowName} numberOfLines={1}>{name}</Text>
        <Text style={st.rowHandle}>@{username}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 7, flexShrink: 0 }}>
        <TouchableOpacity onPress={onDecline} disabled={busy} style={[st.btn, st.btnSecondary, busy && { opacity: 0.5 }]}>
          <Text style={st.btnSecondaryText}>Decline</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onAccept} disabled={busy} style={[st.btn, st.btnPrimary, busy && { opacity: 0.7 }]}>
          {busy
            ? <ActivityIndicator size="small" color="#FFFBF1" />
            : <Text style={st.btnPrimaryText}>Accept</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function OutgoingRow({
  avatarUrl, name, username, busy, onCancel,
}: {
  avatarUrl: string | null; name: string; username: string;
  busy: boolean; onCancel: () => void;
}) {
  return (
    <View style={st.row}>
      <Avatar url={avatarUrl} name={name} />
      <View style={{ flex: 1, marginLeft: 14, minWidth: 0 }}>
        <Text style={st.rowName} numberOfLines={1}>{name}</Text>
        <Text style={st.rowHandle}>@{username}</Text>
      </View>
      <TouchableOpacity onPress={onCancel} disabled={busy} style={[st.btn, st.btnSecondary, busy && { opacity: 0.5 }]}>
        <Ionicons name="time-outline" size={12} color={C.inkMute} style={{ marginRight: 3 }} />
        <Text style={st.btnSecondaryText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

function SuggestedRow({
  avatarUrl, name, username, subtext, state, onAdd,
}: {
  avatarUrl: string | null; name: string; username: string | null; subtext: string;
  state: ActionState; onAdd: () => void;
}) {
  return (
    <View style={st.row}>
      <Avatar url={avatarUrl} name={name} />
      <View style={{ flex: 1, marginLeft: 14, minWidth: 0 }}>
        <Text style={st.rowName} numberOfLines={1}>{name}</Text>
        <Text style={st.rowHandle} numberOfLines={1}>
          {username ? `@${username} · ` : ''}{subtext}
        </Text>
      </View>
      <TouchableOpacity
        onPress={onAdd}
        disabled={state.sent || state.busy}
        style={[
          st.btn,
          state.sent ? st.btnSecondary : st.btnPrimary,
          (state.busy || state.sent) && { opacity: state.busy ? 0.6 : 1 },
        ]}
      >
        {state.busy ? (
          <ActivityIndicator size="small" color={state.sent ? C.inkMute : '#FFFBF1'} />
        ) : state.sent ? (
          <>
            <Ionicons name="checkmark" size={12} color={C.inkMute} style={{ marginRight: 3 }} />
            <Text style={st.btnSecondaryText}>Sent</Text>
          </>
        ) : (
          <>
            <Ionicons name="person-add-outline" size={12} color="#FFFBF1" style={{ marginRight: 3 }} />
            <Text style={st.btnPrimaryText}>Add Friend</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ── Search result row ─────────────────────────────────────────────────────────

function SearchResultRow({
  user, isFriend, isIncoming, isSent, busy, onAdd,
}: {
  user: SearchUser;
  isFriend: boolean; isIncoming: boolean; isSent: boolean;
  busy: boolean; onAdd: () => void;
}) {
  const name = displayName(user);
  return (
    <View style={[st.row, { borderBottomWidth: 0.5, borderBottomColor: C.hairline }]}>
      <Avatar url={user.avatar_url} name={name} size={36} />
      <View style={{ flex: 1, marginLeft: 12, minWidth: 0 }}>
        <Text style={st.rowName} numberOfLines={1}>{name}</Text>
        <Text style={st.rowHandle}>@{user.username}</Text>
      </View>
      {isFriend ? (
        <View style={st.statusChip}>
          <Ionicons name="people-outline" size={11} color={C.primary} style={{ marginRight: 3 }} />
          <Text style={[st.statusChipText, { color: C.primary }]}>Friends</Text>
        </View>
      ) : isIncoming ? (
        <View style={st.statusChip}>
          <Text style={st.statusChipText}>Respond ↑</Text>
        </View>
      ) : isSent ? (
        <View style={st.statusChip}>
          <Ionicons name="time-outline" size={11} color={C.inkMute} style={{ marginRight: 3 }} />
          <Text style={st.statusChipText}>Pending</Text>
        </View>
      ) : (
        <TouchableOpacity onPress={onAdd} disabled={busy} style={[st.btn, st.btnPrimary, busy && { opacity: 0.6 }]}>
          {busy
            ? <ActivityIndicator size="small" color="#FFFBF1" />
            : <><Ionicons name="person-add-outline" size={12} color="#FFFBF1" style={{ marginRight: 3 }} /><Text style={st.btnPrimaryText}>Add</Text></>}
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function FriendsScreen() {
  const { getToken } = useAuth();

  const [friends,    setFriends]    = useState<FriendUser[]  | null>(null);
  const [incoming,   setIncoming]   = useState<PendingUser[] | null>(null);
  const [outgoing,   setOutgoing]   = useState<PendingUser[] | null>(null);
  const [suggested,  setSuggested]  = useState<SuggestedUser[]>([]);
  const [sugLoading, setSugLoading] = useState(true);

  const [searchQ,    setSearchQ]    = useState('');
  const [results,    setResults]    = useState<SearchUser[]>([]);
  const [searching,  setSearching]  = useState(false);

  const [respondedTo,     setRespondedTo]     = useState<Set<number>>(new Set());
  const [busyFriend,      setBusyFriend]      = useState<Set<string>>(new Set());
  const [busyPending,     setBusyPending]     = useState<Set<number>>(new Set());
  const [busySearch,      setBusySearch]      = useState<Set<string>>(new Set());
  const [sentSearch,      setSentSearch]      = useState<Set<string>>(new Set());
  const [sentSuggestion,  setSentSuggestion]  = useState<Set<string>>(new Set());
  const [busySuggestion,  setBusySuggestion]  = useState<Set<string>>(new Set());

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loading  = friends === null;

  // ── Load ───────────────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    const tok = await getToken();
    if (!tok) return;
    const h = { Authorization: `Bearer ${tok}` };

    const [fr, inc, out] = await Promise.allSettled([
      fetch(`${BASE}/api/friends?type=friends`,          { headers: h }).then(r => r.ok ? r.json() : []),
      fetch(`${BASE}/api/friends?type=pending_incoming`, { headers: h }).then(r => r.ok ? r.json() : []),
      fetch(`${BASE}/api/friends?type=pending_outgoing`, { headers: h }).then(r => r.ok ? r.json() : []),
    ]);

    if (fr.status  === 'fulfilled') setFriends(fr.value   ?? []);
    if (inc.status === 'fulfilled') setIncoming(inc.value ?? []);
    if (out.status === 'fulfilled') setOutgoing(out.value ?? []);

    setSugLoading(true);
    fetch(`${BASE}/api/users/suggestions?limit=8`, { headers: h })
      .then(r => r.ok ? r.json() : [])
      .then(setSuggested)
      .catch(() => {})
      .finally(() => setSugLoading(false));
  }, [getToken]);

  useFocusEffect(useCallback(() => { loadAll(); }, [loadAll]));

  // ── Search ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (!searchQ.trim()) { setResults([]); setSearching(false); return; }
    setSearching(true);
    debounce.current = setTimeout(async () => {
      try {
        const tok = await getToken();
        if (!tok) return;
        const r = await fetch(
          `${BASE}/api/users?search=${encodeURIComponent(searchQ.trim())}&limit=12`,
          { headers: { Authorization: `Bearer ${tok}` } },
        );
        setResults(r.ok ? await r.json() : []);
      } catch { /* ignore */ }
      finally { setSearching(false); }
    }, 280);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [searchQ, getToken]);

  // ── Actions ────────────────────────────────────────────────────────────────

  async function handleRespond(r: PendingUser, action: 'accept' | 'reject') {
    if (busyPending.has(r.friendship_id)) return;
    setBusyPending(s => new Set([...s, r.friendship_id]));
    try {
      const tok = await getToken(); if (!tok) return;
      const res = await fetch(`${BASE}/api/friends`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ friendshipId: r.friendship_id, action }),
      });
      if (res.ok) {
        setRespondedTo(s => new Set([...s, r.friendship_id]));
        if (action === 'accept') {
          setFriends(s => s ? [{ clerk_user_id: r.clerk_user_id, username: r.username, display_name: r.display_name, avatar_url: r.avatar_url, friends_since: new Date().toISOString() }, ...s] : s);
        }
      }
    } catch { Alert.alert('Error', 'Something went wrong. Try again.'); }
    finally { setBusyPending(s => { const n = new Set(s); n.delete(r.friendship_id); return n; }); }
  }

  function confirmUnfriend(f: FriendUser) {
    Alert.alert(
      'Remove friend',
      `Remove ${displayName(f)} from your friends?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            setBusyFriend(s => new Set([...s, f.clerk_user_id]));
            try {
              const tok = await getToken(); if (!tok) return;
              const res = await fetch(`${BASE}/api/friends?userId=${f.clerk_user_id}`, {
                method: 'DELETE', headers: { Authorization: `Bearer ${tok}` },
              });
              if (res.ok) setFriends(s => s ? s.filter(u => u.clerk_user_id !== f.clerk_user_id) : s);
            } catch { Alert.alert('Error', 'Something went wrong.'); }
            finally { setBusyFriend(s => { const n = new Set(s); n.delete(f.clerk_user_id); return n; }); }
          },
        },
      ],
    );
  }

  async function handleCancelRequest(r: PendingUser) {
    const tok = await getToken(); if (!tok) return;
    const res = await fetch(`${BASE}/api/friends?userId=${r.clerk_user_id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${tok}` },
    });
    if (res.ok) setOutgoing(s => s ? s.filter(u => u.clerk_user_id !== r.clerk_user_id) : s);
  }

  async function handleAddSuggested(u: SuggestedUser) {
    if (sentSuggestion.has(u.clerk_user_id) || busySuggestion.has(u.clerk_user_id)) return;
    setBusySuggestion(s => new Set([...s, u.clerk_user_id]));
    try {
      const tok = await getToken(); if (!tok) return;
      const res = await fetch(`${BASE}/api/friends`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: u.clerk_user_id }),
      });
      if (res.ok) setSentSuggestion(s => new Set([...s, u.clerk_user_id]));
    } catch { /* ignore */ }
    finally { setBusySuggestion(s => { const n = new Set(s); n.delete(u.clerk_user_id); return n; }); }
  }

  async function handleAddFromSearch(u: SearchUser) {
    if (sentSearch.has(u.clerk_user_id)) return;
    setBusySearch(s => new Set([...s, u.clerk_user_id]));
    try {
      const tok = await getToken(); if (!tok) return;
      const res = await fetch(`${BASE}/api/friends`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: u.clerk_user_id }),
      });
      if (res.ok) setSentSearch(s => new Set([...s, u.clerk_user_id]));
      else { /* failed — no optimistic update needed */ }
    } catch { /* ignore */ }
    finally { setBusySearch(s => { const n = new Set(s); n.delete(u.clerk_user_id); return n; }); }
  }

  // ── Build list rows ────────────────────────────────────────────────────────

  const friendSet   = new Set((friends  ?? []).map(f => f.clerk_user_id));
  const incomingSet = new Set((incoming ?? []).map(f => f.clerk_user_id));
  const outgoingSet = new Set((outgoing ?? []).map(f => f.clerk_user_id));
  const pendingIncoming = (incoming ?? []).filter(r => !respondedTo.has(r.friendship_id));

  const rows: ListRow[] = [];

  rows.push({ _t: 'header' });
  rows.push({ _t: 'searchbar' });

  if (searchQ.trim()) {
    rows.push({ _t: 'search_results', results });
  } else {
    // Suggestions (top, like web)
    if (sugLoading || suggested.length > 0) {
      rows.push({ _t: 'section', label: 'PEOPLE YOU MAY KNOW', icon: 'sparkles-outline' });
      if (sugLoading) {
        rows.push({ _t: 'skeleton' }, { _t: 'skeleton' }, { _t: 'skeleton' });
      } else {
        suggested.forEach(u => rows.push({ _t: 'suggested', item: u }));
      }
    }

    // Incoming requests
    if (pendingIncoming.length > 0) {
      rows.push({ _t: 'section', label: 'FRIEND REQUESTS', icon: 'person-add-outline', count: pendingIncoming.length, accent: true });
      pendingIncoming.forEach(r => rows.push({ _t: 'incoming', item: r }));
    }

    // Friends
    rows.push({ _t: 'section', label: 'FRIENDS', icon: 'people-outline', count: (friends ?? []).length });
    if (loading) {
      rows.push({ _t: 'skeleton' }, { _t: 'skeleton' }, { _t: 'skeleton' });
    } else if ((friends ?? []).length === 0) {
      rows.push({ _t: 'empty', message: 'No friends yet. Search above or check out the suggestions below.' });
    } else {
      (friends ?? []).forEach(f => rows.push({ _t: 'friend', item: f }));
    }

    // Sent requests
    if ((outgoing ?? []).length > 0) {
      rows.push({ _t: 'section', label: 'SENT REQUESTS', icon: 'time-outline', count: (outgoing ?? []).length });
      (outgoing ?? []).forEach(r => rows.push({ _t: 'outgoing', item: r }));
    }
  }

  // ── Render rows ────────────────────────────────────────────────────────────

  function renderRow({ item }: { item: ListRow }) {
    switch (item._t) {
      case 'header':
        return (
          <View style={st.pageHeader}>
            <Text style={st.kicker}>CONNECTIONS</Text>
            <Text style={st.pageTitle}>Friends</Text>
            <Text style={st.pageSub}>
              {loading
                ? 'Loading…'
                : `${(friends ?? []).length} friend${(friends ?? []).length !== 1 ? 's' : ''} · ${pendingIncoming.length > 0 ? `${pendingIncoming.length} pending` : 'no pending requests'}`}
            </Text>
          </View>
        );

      case 'searchbar':
        return (
          <View style={{ paddingHorizontal: 16, marginBottom: 24 }}>
            <View style={st.searchBox}>
              <Ionicons name="search" size={14} color={C.inkMute} />
              <TextInput
                value={searchQ} onChangeText={setSearchQ}
                placeholder="Search by name or username…"
                placeholderTextColor={C.inkMute}
                style={st.searchInput}
                autoCorrect={false} autoCapitalize="none"
                clearButtonMode="while-editing"
                returnKeyType="search"
              />
              {searching && <ActivityIndicator size="small" color={C.inkMute} />}
            </View>
          </View>
        );

      case 'search_results': {
        const { results: res } = item;
        return (
          <View style={{ paddingHorizontal: 16, marginBottom: 24 }}>
            {res.length === 0 && !searching ? (
              <View style={[st.card, { padding: 20, alignItems: 'center' }]}>
                <Text style={{ fontSize: 13, color: C.inkMute }}>No users found for "{searchQ}"</Text>
              </View>
            ) : (
              <View style={st.card}>
                {res.map(u => (
                  <SearchResultRow
                    key={u.clerk_user_id}
                    user={u}
                    isFriend={friendSet.has(u.clerk_user_id)}
                    isIncoming={incomingSet.has(u.clerk_user_id)}
                    isSent={sentSearch.has(u.clerk_user_id) || outgoingSet.has(u.clerk_user_id)}
                    busy={busySearch.has(u.clerk_user_id)}
                    onAdd={() => handleAddFromSearch(u)}
                  />
                ))}
              </View>
            )}
          </View>
        );
      }

      case 'section':
        return (
          <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
            <SectionHead label={item.label} icon={item.icon} count={item.count} accent={item.accent} />
          </View>
        );

      case 'skeleton':
        return (
          <View style={{ paddingHorizontal: 16, marginBottom: 2 }}>
            <View style={st.card}>
              <SkeletonRow />
            </View>
          </View>
        );

      case 'empty':
        return (
          <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
            <View style={[st.card, st.emptyCard]}>
              <Ionicons name="people-outline" size={28} color={C.inkMute} />
              <Text style={st.emptyText}>{item.message}</Text>
            </View>
          </View>
        );

      case 'friend': {
        const { item: f } = item;
        const name = displayName(f);
        return (
          <View style={{ paddingHorizontal: 16, marginBottom: 2 }}>
            <View style={st.card}>
              <FriendRow
                avatarUrl={f.avatar_url} name={name} username={f.username}
                subtext={f.friends_since ? `Friends since ${new Date(f.friends_since).getFullYear()}` : undefined}
                busy={busyFriend.has(f.clerk_user_id)}
                onUnfriend={() => confirmUnfriend(f)}
              />
            </View>
          </View>
        );
      }

      case 'incoming': {
        const { item: r } = item;
        const name = displayName(r);
        return (
          <View style={{ paddingHorizontal: 16, marginBottom: 2 }}>
            <View style={st.card}>
              <IncomingRow
                avatarUrl={r.avatar_url} name={name} username={r.username}
                busy={busyPending.has(r.friendship_id)}
                onAccept={() => handleRespond(r, 'accept')}
                onDecline={() => handleRespond(r, 'reject')}
              />
            </View>
          </View>
        );
      }

      case 'outgoing': {
        const { item: r } = item;
        const name = displayName(r);
        return (
          <View style={{ paddingHorizontal: 16, marginBottom: 2 }}>
            <View style={st.card}>
              <OutgoingRow
                avatarUrl={r.avatar_url} name={name} username={r.username}
                busy={false}
                onCancel={() => handleCancelRequest(r)}
              />
            </View>
          </View>
        );
      }

      case 'suggested': {
        const { item: u } = item;
        const name = displayName(u);
        const subtext = u.mutual_friends > 0
          ? `${u.mutual_friends} mutual friend${u.mutual_friends !== 1 ? 's' : ''}`
          : u.shared_parks > 0
          ? `${u.shared_parks} shared park${u.shared_parks !== 1 ? 's' : ''}`
          : u.visit_count > 0
          ? `${u.visit_count} park${u.visit_count !== 1 ? 's' : ''} visited`
          : 'Explorer';
        return (
          <View style={{ paddingHorizontal: 16, marginBottom: 2 }}>
            <View style={st.card}>
              <SuggestedRow
                avatarUrl={u.avatar_url} name={name} username={u.username}
                subtext={subtext}
                state={{ sent: sentSuggestion.has(u.clerk_user_id), busy: busySuggestion.has(u.clerk_user_id) }}
                onAdd={() => handleAddSuggested(u)}
              />
            </View>
          </View>
        );
      }

      default: return null;
    }
  }

  return (
    <SafeAreaView style={st.screen} edges={['bottom']}>
      <FlatList
        data={rows}
        keyExtractor={(item, index) => {
          if (item._t === 'friend')    return `friend-${item.item.clerk_user_id}`;
          if (item._t === 'incoming')  return `incoming-${item.item.friendship_id}`;
          if (item._t === 'outgoing')  return `outgoing-${item.item.friendship_id}`;
          if (item._t === 'suggested') return `sug-${item.item.clerk_user_id}`;
          return `row-${index}`;
        }}
        renderItem={renderRow}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: 40 }}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },

  pageHeader: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 24 },
  kicker:    { fontSize: 9.5, fontWeight: '600', color: C.inkMute, letterSpacing: 1.4, marginBottom: 3 },
  pageTitle: { fontSize: 32, fontWeight: '800', color: C.ink, letterSpacing: -0.7 },
  pageSub:   { fontSize: 13.5, color: C.inkMute, marginTop: 4 },

  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    backgroundColor: C.surface, borderRadius: 10,
    borderWidth: 0.5, borderColor: C.hairline,
    padding: 10, paddingHorizontal: 14,
  },
  searchInput: { flex: 1, fontSize: 13.5, color: C.ink, padding: 0 },

  sectionHead: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginBottom: 6,
  },
  sectionLabel: {
    fontSize: 10, fontWeight: '700', color: C.inkMute, letterSpacing: 1.4,
  },
  badge: {
    backgroundColor: C.inkMute, borderRadius: 10,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  badgeText: { fontSize: 9, fontWeight: '700', color: '#FFFBF1' },

  card: {
    backgroundColor: C.surface, borderRadius: 12,
    borderWidth: 0.5, borderColor: C.hairline,
    overflow: 'hidden',
    marginBottom: 8,
  },
  emptyCard: {
    padding: 32, alignItems: 'center', gap: 10,
  },
  emptyText: {
    fontSize: 13, color: C.inkMute, textAlign: 'center', lineHeight: 18, maxWidth: 260,
  },

  row: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, paddingHorizontal: 16,
  },
  rowName:   { fontSize: 14, fontWeight: '700', color: C.ink },
  rowHandle: { fontSize: 11, color: C.inkMute, marginTop: 1 },
  rowSub:    { fontSize: 11, color: C.inkMute },

  btn: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
    flexShrink: 0,
  },
  btnPrimary:       { backgroundColor: C.primary },
  btnPrimaryText:   { fontSize: 12.5, fontWeight: '700', color: '#FFFBF1' },
  btnSecondary:     { backgroundColor: C.surfaceAlt, borderWidth: 0.5, borderColor: C.hairline },
  btnSecondaryText: { fontSize: 12.5, fontWeight: '600', color: C.inkSoft },

  statusChip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surfaceAlt, borderRadius: 7,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 0.5, borderColor: C.hairline,
  },
  statusChipText: { fontSize: 11.5, fontWeight: '600', color: C.inkMute },
});
