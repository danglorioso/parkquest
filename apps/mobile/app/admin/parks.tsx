import {
  ActivityIndicator, FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { STATIC as C } from '@/lib/palette';
import { getAdminParks, type AdminParkRow } from '@/lib/api';

const SORT_OPTIONS: { key: string; label: string }[] = [
  { key: 'visit_count', label: 'Visits' },
  { key: 'post_count', label: 'Posts' },
  { key: 'avg_rating', label: 'Rating' },
  { key: 'avg_crowd', label: 'Crowd' },
  { key: 'avg_difficulty', label: 'Difficulty' },
  { key: 'pct_would_return', label: '% return' },
];

export default function AdminParksScreen() {
  const { getToken } = useAuth();
  const [parks, setParks] = useState<AdminParkRow[] | null>(null);
  const [sort, setSort] = useState('visit_count');

  const load = useCallback(async () => {
    const tok = await getToken();
    if (!tok) return;
    getAdminParks(tok, sort, 'desc').then(r => setParks(r.parks)).catch(() => setParks([]));
  }, [getToken, sort]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={st.screen}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.sortRow} contentContainerStyle={{ gap: 6, paddingHorizontal: 16 }}>
        {SORT_OPTIONS.map(opt => (
          <TouchableOpacity
            key={opt.key}
            onPress={() => setSort(opt.key)}
            style={[st.chip, sort === opt.key && { backgroundColor: C.visited, borderColor: C.visited }]}
          >
            <Text style={[st.chipText, sort === opt.key && { color: '#fff' }]}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <FlatList
        data={parks ?? []}
        keyExtractor={p => p.park_code}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={parks === null ? <ActivityIndicator color={C.inkMute} style={{ marginTop: 40 }} /> : null}
        renderItem={({ item: p }) => (
          <View style={st.row}>
            <Text style={st.name}>{p.name}</Text>
            <Text style={st.meta}>
              {p.visit_count} visits · {p.post_count} posts
            </Text>
            <Text style={st.meta}>
              Rating {p.avg_rating ?? '—'} · Crowd {p.avg_crowd ?? '—'} · Difficulty {p.avg_difficulty ?? '—'} · Would return {p.pct_would_return != null ? `${p.pct_would_return}%` : '—'}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  sortRow: { flexGrow: 0, marginTop: 12, marginBottom: 4 },
  chip: {
    borderRadius: 100, borderWidth: 0.5, borderColor: C.hairline,
    backgroundColor: C.surface, paddingHorizontal: 12, paddingVertical: 6,
  },
  chipText: { fontSize: 12.5, fontWeight: '600', color: C.inkSoft },
  row: {
    backgroundColor: C.surface, borderRadius: 12,
    borderWidth: 0.5, borderColor: C.hairline, padding: 12, marginBottom: 8,
  },
  name: { fontSize: 14, fontWeight: '700', color: C.ink },
  meta: { fontSize: 12, color: C.inkMute, marginTop: 3 },
});
