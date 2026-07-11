import {
  ActivityIndicator, FlatList, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View,
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
  impersonation: 'Impersonation',
  misleading: 'Misleading or fake account',
  blocked: 'Blocked by user',
  other: 'Other',
};

const TABS: { key: 'open' | 'dismissed' | 'actioned'; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'dismissed', label: 'Dismissed' },
  { key: 'actioned', label: 'Actioned' },
];

export default function AdminReportsScreen() {
  const { getToken } = useAuth();
  const [status, setStatus] = useState<'open' | 'dismissed' | 'actioned'>('open');
  const [reports, setReports] = useState<EnrichedReport[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async (s: 'open' | 'dismissed' | 'actioned') => {
    const tok = await getToken();
    if (!tok) return;
    setReports(null);
    getAdminReports(tok, s).then(setReports).catch(() => setReports([]));
  }, [getToken]);

  useFocusEffect(useCallback(() => { load(status); }, [load, status]));

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
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12 }}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            onPress={() => setStatus(t.key)}
            style={[st.tab, status === t.key && st.tabActive]}
          >
            <Text style={[st.tabText, status === t.key && st.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
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
              title={`No ${status} reports`}
              subtitle="The moderation queue is clear."
            />
          )
        }
        renderItem={({ item: r }) => (
          <View style={st.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={st.cardTitle}>
                {r.target_type.toUpperCase()} #{r.target_id} · {REASON_LABELS[r.reason] ?? r.reason}
              </Text>
            </View>
            <Text style={st.cardMeta}>
              Reported by @{r.reporter_username ?? r.reporter_id}
              {r.target_username ? ` — target: @${r.target_username}` : ''}
            </Text>
            {r.target_photos && r.target_photos.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}>
                {r.target_photos.slice(0, 4).map((url, i) => (
                  <Image key={i} source={{ uri: url }} style={st.photo} />
                ))}
              </ScrollView>
            ) : null}
            {r.target_content ? <Text style={st.cardContent}>{r.target_content}</Text> : null}
            {r.details ? <Text style={st.cardMeta}>Details: {r.details}</Text> : null}
            {status === 'open' ? (
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
            ) : (
              <Text style={st.cardMeta}>
                {r.status === 'dismissed' ? 'Dismissed' : 'Actioned'}
                {r.reviewed_at ? ` on ${new Date(r.reviewed_at).toLocaleString()}` : ''}
              </Text>
            )}
          </View>
        )}
      />
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  tab: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8,
    borderWidth: 0.5, borderColor: C.hairline, backgroundColor: C.surface,
  },
  tabActive: { backgroundColor: C.ink, borderColor: C.ink },
  tabText: { fontSize: 12.5, fontWeight: '600', color: C.inkSoft },
  tabTextActive: { color: C.surface },
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
  photo: { width: 88, height: 88, borderRadius: 8, marginRight: 6, backgroundColor: C.hairlineSoft },
  btn: {
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 0.5, borderColor: C.hairline,
  },
  btnText: { fontSize: 12.5, fontWeight: '600', color: C.inkSoft },
});
