import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { STATIC as C } from '@/lib/palette';
import { getAdminPosts, type AdminPostRow } from '@/lib/api';

export default function AdminPostsScreen() {
  const { getToken } = useAuth();
  const router = useRouter();
  const [posts, setPosts] = useState<AdminPostRow[] | null>(null);

  const load = useCallback(async () => {
    const tok = await getToken();
    if (!tok) return;
    getAdminPosts(tok).then(r => setPosts(r.posts)).catch(() => setPosts([]));
  }, [getToken]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={st.screen}>
      <FlatList
        data={posts ?? []}
        keyExtractor={p => String(p.id)}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={posts === null ? <ActivityIndicator color={C.inkMute} style={{ marginTop: 40 }} /> : null}
        renderItem={({ item: p }) => (
          <TouchableOpacity style={st.row} onPress={() => router.push(`/p/${p.id}` as never)}>
            <Text style={st.name}>{p.username ? `@${p.username}` : p.display_name ?? '—'}</Text>
            {p.caption ? <Text style={st.caption} numberOfLines={2}>{p.caption}</Text> : null}
            <Text style={st.meta}>
              {p.park_name ?? 'No park'} · {p.created_at ? new Date(p.created_at).toLocaleDateString() : ''}
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  row: {
    backgroundColor: C.surface, borderRadius: 12,
    borderWidth: 0.5, borderColor: C.hairline, padding: 12, marginBottom: 8,
  },
  name: { fontSize: 14, fontWeight: '700', color: C.ink },
  caption: { fontSize: 13, color: C.inkSoft, marginTop: 3 },
  meta: { fontSize: 12, color: C.inkMute, marginTop: 4 },
});
