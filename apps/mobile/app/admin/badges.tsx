import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { STATIC as C } from '@/lib/palette';
import { getAdminBadges, type AdminBadgeRow } from '@/lib/api';

export default function AdminBadgesScreen() {
  const { getToken } = useAuth();
  const [badges, setBadges] = useState<AdminBadgeRow[] | null>(null);
  const [activeUsers, setActiveUsers] = useState(0);

  const load = useCallback(async () => {
    const tok = await getToken();
    if (!tok) return;
    getAdminBadges(tok).then(r => { setBadges(r.badges); setActiveUsers(r.active_users); }).catch(() => setBadges([]));
  }, [getToken]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const max = Math.max(...(badges ?? []).map(b => b.count), 1);

  return (
    <View style={st.screen}>
      <FlatList
        data={badges ?? []}
        keyExtractor={b => b.id}
        contentContainerStyle={{ padding: 16 }}
        ListHeaderComponent={
          badges && badges.length > 0 ? (
            <Text style={st.header}>% of the {activeUsers.toLocaleString()} active users who've earned each badge</Text>
          ) : null
        }
        ListEmptyComponent={badges === null ? <ActivityIndicator color={C.inkMute} style={{ marginTop: 40 }} /> : null}
        renderItem={({ item: b }) => (
          <View style={st.row}>
            <Text style={st.emoji}>{b.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={st.name}>{b.name}</Text>
              <View style={st.barTrack}>
                <View style={[st.barFill, { width: `${(b.count / max) * 100}%` }]} />
              </View>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={st.pct}>{b.pct_of_active}%</Text>
              <Text style={st.count}>{b.count}</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { fontSize: 12, color: C.inkMute, marginBottom: 12 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.surface, borderRadius: 12,
    borderWidth: 0.5, borderColor: C.hairline, padding: 12, marginBottom: 8,
  },
  emoji: { fontSize: 20 },
  name: { fontSize: 13, fontWeight: '600', color: C.inkSoft, marginBottom: 5 },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: C.hairlineSoft, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: C.visited, borderRadius: 3 },
  pct: { fontSize: 12, color: C.inkMute },
  count: { fontSize: 13, fontWeight: '700', color: C.ink },
});
