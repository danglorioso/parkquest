import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/Avatar';
import { STATIC as C, useColors } from '@/lib/palette';
import { getMyReports, getBlockedUsers, unblockUser, deleteReport } from '@/lib/api';
import { getDefaultVisibility, setDefaultVisibility, type DefaultVisibility } from '@/lib/settings';
import type { Report, BlockedUser } from '@parkquest/types';

const VIS_OPTS: { v: DefaultVisibility; icon: React.ComponentProps<typeof Ionicons>['name']; label: string; desc: string }[] = [
  { v: 'public',  icon: 'globe-outline',       label: 'Public',  desc: 'Posted publicly for all explorers' },
  { v: 'friends', icon: 'people-outline',      label: 'Friends', desc: "Posted to your friends' feeds" },
  { v: 'private', icon: 'lock-closed-outline', label: 'Private', desc: 'Only you, never posted to the feed' },
];

const REASON_LABELS: Record<string, string> = {
  spam: 'Spam',
  harassment: 'Harassment',
  inappropriate: 'Inappropriate content',
  other: 'Other',
};

const STATUS_LABELS: Record<string, string> = {
  open: 'Pending review',
  actioned: 'Actioned',
  dismissed: 'Dismissed',
};

export default function ModerationScreen() {
  const { getToken } = useAuth();
  const router = useRouter();
  const T = useColors();
  const [reports, setReports] = useState<Report[] | null>(null);
  const [blocked, setBlocked] = useState<BlockedUser[] | null>(null);
  const [unblockBusy, setUnblockBusy] = useState<Set<string>>(new Set());
  const [deleteBusy, setDeleteBusy] = useState<Set<number>>(new Set());
  const [defaultVis, setDefaultVis] = useState<DefaultVisibility | null>(null);

  const load = useCallback(async () => {
    const tok = await getToken();
    if (!tok) return;
    getMyReports(tok).then(setReports).catch(() => setReports([]));
    getBlockedUsers(tok).then(setBlocked).catch(() => setBlocked([]));
  }, [getToken]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => { getDefaultVisibility().then(setDefaultVis); }, []);

  const chooseDefaultVis = (v: DefaultVisibility) => {
    setDefaultVis(v);
    setDefaultVisibility(v);
  };

  const handleUnblock = async (u: BlockedUser) => {
    if (unblockBusy.has(u.clerk_user_id)) return;
    setUnblockBusy(s => new Set([...s, u.clerk_user_id]));
    try {
      const tok = await getToken();
      if (!tok) return;
      await unblockUser(tok, u.clerk_user_id);
      setBlocked(prev => prev?.filter(b => b.clerk_user_id !== u.clerk_user_id) ?? prev);
    } finally {
      setUnblockBusy(s => { const n = new Set(s); n.delete(u.clerk_user_id); return n; });
    }
  };

  const handleDeleteReport = (r: Report) => {
    if (deleteBusy.has(r.id)) return;
    Alert.alert(
      'Undo report',
      r.target_type === 'post'
        ? 'This post will be able to reappear in your feed.'
        : 'This will withdraw your report.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Undo report', style: 'destructive', onPress: async () => {
            setDeleteBusy(s => new Set([...s, r.id]));
            try {
              const tok = await getToken();
              if (!tok) return;
              await deleteReport(tok, r.id);
              setReports(prev => prev?.filter(x => x.id !== r.id) ?? prev);
            } catch {
              Alert.alert('Error', 'Could not undo this report. Please try again.');
            } finally {
              setDeleteBusy(s => { const n = new Set(s); n.delete(r.id); return n; });
            }
          },
        },
      ],
    );
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 20, gap: 24 }}>
      <View style={{ gap: 8 }}>
        <Text style={st.sectionLabel}>DEFAULT POST VISIBILITY</Text>
        <Text style={st.sectionHint}>Applied to new visits you log — change it per-visit anytime.</Text>
        {VIS_OPTS.map(o => {
          const on = defaultVis === o.v;
          return (
            <TouchableOpacity
              key={o.v}
              onPress={() => chooseDefaultVis(o.v)}
              activeOpacity={0.7}
              style={[st.visRow, { borderColor: on ? T.primary : 'transparent', backgroundColor: on ? C.surface : C.surfaceAlt }]}
            >
              <View style={[st.visIcon, { backgroundColor: on ? T.primary : C.surface, borderColor: on ? T.primary : C.hairline }]}>
                <Ionicons name={o.icon} size={16} color={on ? C.onPrimary : C.inkSoft} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.rowName}>{o.label}</Text>
                <Text style={st.rowHandle}>{o.desc}</Text>
              </View>
              <View style={[st.visRadio, { borderColor: on ? T.primary : C.hairline, backgroundColor: on ? T.primary : 'transparent' }]}>
                {on && <Ionicons name="checkmark" size={11} color={C.onPrimary} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={{ gap: 8 }}>
        <Text style={st.sectionLabel}>BLOCKED USERS</Text>
        {blocked === null ? (
          <ActivityIndicator color={C.inkMute} style={{ marginTop: 8 }} />
        ) : blocked.length === 0 ? (
          <Text style={st.emptyText}>You haven't blocked anyone.</Text>
        ) : (
          blocked.map(u => {
            const name = u.display_name ?? u.username ?? 'Explorer';
            const busy = unblockBusy.has(u.clerk_user_id);
            return (
              <View key={u.clerk_user_id} style={st.blockedRow}>
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}
                  activeOpacity={0.7}
                  onPress={() => router.push(`/user/${u.clerk_user_id}` as never)}
                >
                  <Avatar url={u.avatar_url} name={name} size={40} />
                  <View style={{ flex: 1, marginLeft: 12, minWidth: 0 }}>
                    <Text style={st.rowName} numberOfLines={1}>{name}</Text>
                    {u.username ? <Text style={st.rowHandle}>@{u.username}</Text> : null}
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleUnblock(u)}
                  disabled={busy}
                  style={[st.unblockBtn, busy && { opacity: 0.5 }]}
                >
                  {busy
                    ? <ActivityIndicator size="small" color={C.inkSoft} />
                    : <Text style={st.unblockBtnText}>Unblock</Text>}
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </View>

      <View style={{ gap: 8 }}>
        <Text style={st.sectionLabel}>REPORTS YOU'VE SENT</Text>
        {reports === null ? (
          <ActivityIndicator color={C.inkMute} style={{ marginTop: 8 }} />
        ) : reports.length === 0 ? (
          <Text style={st.emptyText}>You haven't reported anything.</Text>
        ) : (
          reports.map(r => {
            const busy = deleteBusy.has(r.id);
            return (
              <View key={r.id} style={st.card}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={st.cardTitle}>{r.target_type.toUpperCase()} · {REASON_LABELS[r.reason] ?? r.reason}</Text>
                  <Text style={st.cardStatus}>{STATUS_LABELS[r.status] ?? r.status}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={st.cardMeta}>{r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}</Text>
                  <TouchableOpacity
                    onPress={() => handleDeleteReport(r)}
                    disabled={busy}
                    style={[st.deleteBtn, busy && { opacity: 0.5 }]}
                  >
                    {busy
                      ? <ActivityIndicator size="small" color={C.inkSoft} />
                      : <Text style={st.deleteBtnText}>Undo report</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  sectionLabel: { fontSize: 11.5, fontWeight: '700', color: C.inkMute, letterSpacing: 1 },
  sectionHint: { fontSize: 12.5, color: C.inkMute, marginBottom: 2 },
  emptyText: { fontSize: 13, color: C.inkMute },
  visRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 12, borderWidth: 1.5, padding: 12,
  },
  visIcon: {
    width: 34, height: 34, borderRadius: 10, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  visRadio: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  blockedRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surface, borderRadius: 12,
    borderWidth: 0.5, borderColor: C.hairline,
    padding: 12, gap: 10,
  },
  rowName: { fontSize: 14, fontWeight: '700', color: C.ink },
  rowHandle: { fontSize: 13, color: C.inkMute, marginTop: 1 },
  unblockBtn: {
    borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: C.surfaceAlt, borderWidth: 0.5, borderColor: C.hairline,
    flexShrink: 0, minHeight: 32, alignItems: 'center', justifyContent: 'center',
  },
  unblockBtnText: { fontSize: 13, fontWeight: '600', color: C.inkSoft },
  card: {
    backgroundColor: C.surface, borderRadius: 12,
    borderWidth: 0.5, borderColor: C.hairline, padding: 12, gap: 6,
  },
  cardTitle: { fontSize: 12.5, fontWeight: '700', color: C.ink },
  cardStatus: { fontSize: 12, color: C.inkMute },
  cardMeta: { fontSize: 12, color: C.inkMute },
  deleteBtn: {
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: C.surfaceAlt, borderWidth: 0.5, borderColor: C.hairline,
  },
  deleteBtnText: { fontSize: 12, fontWeight: '600', color: C.inkSoft },
});
