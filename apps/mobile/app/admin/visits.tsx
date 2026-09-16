import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, Stack } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { AdminMenu } from '@/components/AdminMenu';
import { STATIC as C } from '@/lib/palette';
import { getAdminVisits, type AdminVisitRow } from '@/lib/api';

export default function AdminVisitsScreen() {
  const { getToken } = useAuth();
  const [visits, setVisits] = useState<AdminVisitRow[] | null>(null);
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
    getAdminVisits(tok, 1).then(r => { setVisits(r.visits); setHasMore(r.has_more); }).catch(() => { setVisits([]); setHasMore(false); });
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
      const r = await getAdminVisits(tok, nextPage);
      pageRef.current = nextPage;
      setVisits(prev => [...(prev ?? []), ...r.visits]);
      setHasMore(r.has_more);
    } catch (e) {
      console.error('Admin visits load-more failed:', e);
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
          data={visits ?? []}
          keyExtractor={v => String(v.id)}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={visits === null ? <ActivityIndicator color={C.inkMute} style={{ marginTop: 40 }} /> : null}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={C.inkMute} style={{ marginVertical: 20 }} /> : null}
          renderItem={({ item: v }) => (
            <View style={st.row}>
              <Text style={st.name}>{v.username ? `@${v.username}` : v.display_name ?? '—'}</Text>
              <Text style={st.meta}>
                {v.park_name ?? '—'} · {v.is_bucket_list ? 'Bucket list' : 'Visit'}
                {v.visited_date ? ` · ${new Date(v.visited_date).toLocaleDateString()}` : ''}
              </Text>
              <Text style={st.meta}>
                Rating: {v.rating ?? '—'} · {v.visibility}
              </Text>
            </View>
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
  meta: { fontSize: 12, color: C.inkMute, marginTop: 3 },
});
