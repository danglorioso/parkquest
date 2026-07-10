import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { STATIC as C } from '@/lib/palette';
import { getAdminVisits, type AdminVisitRow } from '@/lib/api';

export default function AdminVisitsScreen() {
  const { getToken } = useAuth();
  const [visits, setVisits] = useState<AdminVisitRow[] | null>(null);

  const load = useCallback(async () => {
    const tok = await getToken();
    if (!tok) return;
    getAdminVisits(tok).then(r => setVisits(r.visits)).catch(() => setVisits([]));
  }, [getToken]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={st.screen}>
      <FlatList
        data={visits ?? []}
        keyExtractor={v => String(v.id)}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={visits === null ? <ActivityIndicator color={C.inkMute} style={{ marginTop: 40 }} /> : null}
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
