import {
  ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { STATIC as C } from '@/lib/palette';
import { getAdminUsers, setUserBanned, type AdminUserRow } from '@/lib/api';

const LOGIN_ICON: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  apple: 'logo-apple', google: 'logo-google', email: 'mail-outline',
};

export default function AdminUsersScreen() {
  const { getToken } = useAuth();
  const router = useRouter();
  const { active } = useLocalSearchParams<{ active?: string }>();
  const activeWindow = active ? Number(active) : undefined;

  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const tok = await getToken();
    if (!tok) return;
    getAdminUsers(tok, 1, activeWindow).then(r => setUsers(r.users)).catch(() => setUsers([]));
  }, [getToken, activeWindow]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggleBan = async (u: AdminUserRow) => {
    if (busyId) return;
    setBusyId(u.clerk_user_id);
    try {
      const tok = await getToken();
      if (!tok) return;
      await setUserBanned(tok, u.clerk_user_id, !u.banned);
      setUsers(prev => prev?.map(x => x.clerk_user_id === u.clerk_user_id ? { ...x, banned: !u.banned } : x) ?? prev);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={st.screen}>
      <FlatList
        data={users ?? []}
        keyExtractor={u => u.clerk_user_id}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={users === null ? <ActivityIndicator color={C.inkMute} style={{ marginTop: 40 }} /> : null}
        renderItem={({ item: u }) => (
          <View style={st.row}>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => router.push(`/user/${u.clerk_user_id}` as never)}>
              <Text style={st.name}>{u.display_name ?? u.username}</Text>
              <Text style={st.meta}>@{u.username} {u.email ? `· ${u.email}` : ''}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                <Ionicons name={LOGIN_ICON[u.login_method]} size={11} color={C.inkMute} />
                <Text style={st.meta}>
                  {u.parks_visited} parks · {u.post_count} posts
                  {u.last_active ? ` · active ${new Date(u.last_active).toLocaleDateString()}` : ''}
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.banBtn, u.banned && { borderColor: C.hairline }]}
              disabled={busyId === u.clerk_user_id}
              onPress={() => toggleBan(u)}
            >
              <Text style={[st.banBtnText, !u.banned && { color: '#C04040' }]}>{u.banned ? 'Unban' : 'Ban'}</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.surface, borderRadius: 12,
    borderWidth: 0.5, borderColor: C.hairline, padding: 12, marginBottom: 8,
  },
  name: { fontSize: 14, fontWeight: '700', color: C.ink },
  meta: { fontSize: 12, color: C.inkMute, marginTop: 1 },
  banBtn: { borderRadius: 8, borderWidth: 0.5, borderColor: '#C04040', paddingHorizontal: 10, paddingVertical: 6 },
  banBtnText: { fontSize: 12, fontWeight: '700', color: C.inkSoft },
});
