import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter, Stack } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { AdminMenu } from '@/components/AdminMenu';
import { STATIC as C } from '@/lib/palette';
import { getAdminPosts, type AdminPostRow } from '@/lib/api';

export default function AdminPostsScreen() {
  const { getToken } = useAuth();
  const router = useRouter();
  const [posts, setPosts] = useState<AdminPostRow[] | null>(null);
  // The API was already paginated (returns has_more) but this screen only
  // ever requested page 1 and threw the flag away — "showing only the
  // first N" was that, not a server-side cap.
  const pageRef = useRef(1);
  const [hasMore, setHasMore] = useState(true);
  const loadingMoreRef = useRef(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    const tok = await getToken();
    if (!tok) return;
    pageRef.current = 1;
    setHasMore(true);
    getAdminPosts(tok, 1).then(r => { setPosts(r.posts); setHasMore(r.has_more); }).catch(() => { setPosts([]); setHasMore(false); });
  }, [getToken]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const tok = await getToken();
      if (!tok) return;
      const nextPage = pageRef.current + 1;
      const r = await getAdminPosts(tok, nextPage);
      pageRef.current = nextPage;
      setPosts(prev => [...(prev ?? []), ...r.posts]);
      setHasMore(r.has_more);
    } catch (e) {
      console.error('Admin posts load-more failed:', e);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [getToken, hasMore]);

  return (
    <>
      <Stack.Screen options={{ headerRight: () => <AdminMenu /> }} />
      <View style={st.screen}>
        <FlatList
          data={posts ?? []}
          keyExtractor={p => String(p.id)}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={posts === null ? <ActivityIndicator color={C.inkMute} style={{ marginTop: 40 }} /> : null}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={C.inkMute} style={{ marginVertical: 20 }} /> : null}
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
    </>
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
