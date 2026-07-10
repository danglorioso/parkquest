import {
  ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { EmptyState } from '@/components/EmptyState';
import { STATIC as C } from '@/lib/palette';
import { getAdminReports, actOnReport } from '@/lib/api';
import type { EnrichedReport } from '@parkquest/types';

const REASON_LABELS: Record<string, string> = {
  spam: 'Spam',
  harassment: 'Harassment',
  inappropriate: 'Inappropriate content',
  other: 'Other',
};

export default function AdminReportsScreen() {
  const { getToken } = useAuth();
  const [reports, setReports] = useState<EnrichedReport[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const tok = await getToken();
    if (!tok) return;
    getAdminReports(tok).then(setReports).catch(() => setReports([]));
  }, [getToken]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const act = async (id: number, action: 'dismiss' | 'remove_content' | 'ban_user') => {
    if (busyId) return;
    setBusyId(id);
    try {
      const tok = await getToken();
      if (!tok) return;
      await actOnReport(tok, id, action);
      setReports(prev => prev?.filter(r => r.id !== id) ?? prev);
    } finally {
      setBusyId(null);
    }
  };

  const loading = reports === null;

  return (
    <View style={st.screen}>
      <FlatList
        data={reports ?? []}
        keyExtractor={r => String(r.id)}
        contentContainerStyle={{ padding: 16, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={C.inkMute} style={{ marginTop: 40 }} />
          ) : (
            <EmptyState
              icon="shield-checkmark-outline"
              title="No open reports"
              subtitle="The moderation queue is clear."
            />
          )
        }
        renderItem={({ item: r }) => (
          <View style={st.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={st.cardTitle}>
                {r.target_type.toUpperCase()} · {REASON_LABELS[r.reason] ?? r.reason}
              </Text>
            </View>
            <Text style={st.cardMeta}>
              Reported by @{r.reporter_username ?? r.reporter_id}
              {r.target_username ? ` — target: @${r.target_username}` : ''}
            </Text>
            {r.target_content ? <Text style={st.cardContent}>{r.target_content}</Text> : null}
            {r.details ? <Text style={st.cardMeta}>Details: {r.details}</Text> : null}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <TouchableOpacity
                style={st.btn} disabled={busyId === r.id}
                onPress={() => act(r.id, 'dismiss')}
              >
                <Text style={st.btnText}>Dismiss</Text>
              </TouchableOpacity>
              {r.target_type !== 'user' && (
                <TouchableOpacity
                  style={st.btn} disabled={busyId === r.id}
                  onPress={() => act(r.id, 'remove_content')}
                >
                  <Text style={st.btnText}>Remove</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[st.btn, { borderColor: '#C04040' }]} disabled={busyId === r.id}
                onPress={() => act(r.id, 'ban_user')}
              >
                <Text style={[st.btnText, { color: '#C04040' }]}>Ban user</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  card: {
    backgroundColor: C.surface, borderRadius: 12,
    borderWidth: 0.5, borderColor: C.hairline,
    padding: 14, marginBottom: 10,
  },
  cardTitle: { fontSize: 13, fontWeight: '700', color: C.ink },
  cardMeta: { fontSize: 12.5, color: C.inkMute, marginBottom: 4 },
  cardContent: {
    fontSize: 13, color: C.inkSoft, backgroundColor: C.hairlineSoft,
    borderRadius: 8, padding: 10, marginBottom: 4,
  },
  btn: {
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 0.5, borderColor: C.hairline,
  },
  btnText: { fontSize: 12.5, fontWeight: '600', color: C.inkSoft },
});
