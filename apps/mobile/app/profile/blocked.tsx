import {
  ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Avatar } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';
import { STATIC as C } from '@/lib/palette';
import { getBlockedUsers, unblockUser } from '@/lib/api';
import type { BlockedUser } from '@parkquest/types';

export default function BlockedUsersScreen() {
  const { getToken } = useAuth();
  const router = useRouter();

  const [blocked, setBlocked] = useState<BlockedUser[] | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const tok = await getToken();
    if (!tok) return;
    getBlockedUsers(tok).then(setBlocked).catch(() => setBlocked([]));
  }, [getToken]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleUnblock = async (u: BlockedUser) => {
    if (busy.has(u.clerk_user_id)) return;
    setBusy(s => new Set([...s, u.clerk_user_id]));
    try {
      const tok = await getToken();
      if (!tok) return;
      await unblockUser(tok, u.clerk_user_id);
      setBlocked(prev => prev?.filter(b => b.clerk_user_id !== u.clerk_user_id) ?? prev);
    } finally {
      setBusy(s => { const n = new Set(s); n.delete(u.clerk_user_id); return n; });
    }
  };

  const loading = blocked === null;

  return (
    <View style={st.screen}>
      <FlatList
        data={blocked ?? []}
        keyExtractor={u => u.clerk_user_id}
        contentContainerStyle={{ padding: 16, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={C.inkMute} style={{ marginTop: 40 }} />
          ) : (
            <EmptyState
              icon="shield-checkmark-outline"
              title="No blocked users"
              subtitle="Users you block will show up here."
            />
          )
        }
        renderItem={({ item }) => {
          const name = item.display_name ?? item.username ?? 'Explorer';
          return (
            <View style={st.row}>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}
                activeOpacity={0.7}
                onPress={() => router.push(`/user/${item.clerk_user_id}` as never)}
              >
                <Avatar url={item.avatar_url} name={name} size={44} />
                <View style={{ flex: 1, marginLeft: 14, minWidth: 0 }}>
                  <Text style={st.rowName} numberOfLines={1}>{name}</Text>
                  {item.username ? <Text style={st.rowHandle}>@{item.username}</Text> : null}
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleUnblock(item)}
                disabled={busy.has(item.clerk_user_id)}
                style={[st.btn, busy.has(item.clerk_user_id) && { opacity: 0.5 }]}
              >
                {busy.has(item.clerk_user_id)
                  ? <ActivityIndicator size="small" color={C.inkSoft} />
                  : <Text style={st.btnText}>Unblock</Text>}
              </TouchableOpacity>
            </View>
          );
        }}
      />
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surface, borderRadius: 12,
    borderWidth: 0.5, borderColor: C.hairline,
    padding: 12, paddingHorizontal: 16, gap: 10,
    marginBottom: 8,
  },
  rowName:   { fontSize: 14, fontWeight: '700', color: C.ink },
  rowHandle: { fontSize: 13, color: C.inkMute, marginTop: 1 },
  btn: {
    borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: C.surfaceAlt, borderWidth: 0.5, borderColor: C.hairline,
    flexShrink: 0, minHeight: 32, alignItems: 'center', justifyContent: 'center',
  },
  btnText: { fontSize: 13, fontWeight: '600', color: C.inkSoft },
});
