import {
  ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { STATIC as C } from '@/lib/palette';
import { getAdminStats, type AdminStats } from '@/lib/api';

// Same validated sequential ramp used on the web admin dashboard (light mode
// only — the mobile app has no dark theme).
const HEAT_COLORS = [C.hairlineSoft, '#5FB08B', '#4C9975', '#397D5E', '#295D47', '#1F3D2E'];

function bucketLevel(count: number, max: number): number {
  if (count <= 0) return 0;
  const ratio = count / max;
  if (ratio <= 0.2) return 1;
  if (ratio <= 0.4) return 2;
  if (ratio <= 0.6) return 3;
  if (ratio <= 0.8) return 4;
  return 5;
}

function StatTile({
  icon, label, value, onPress,
}: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: number; onPress: () => void }) {
  return (
    <TouchableOpacity style={st.tile} onPress={onPress} activeOpacity={0.75}>
      <View style={st.tileIconBox}>
        <Ionicons name={icon} size={16} color={C.visited} />
      </View>
      <Text style={st.tileValue}>{value.toLocaleString()}</Text>
      <Text style={st.tileLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function MiniHeatmap({ data }: { data: { day: string; count: number }[] }) {
  // Last ~16 weeks — enough to show a trend on a phone-width screen without scrolling.
  const weeksToShow = 16;
  const byDay = new Map(data.map(d => [d.day, d.count]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setDate(end.getDate() + (6 - end.getDay()));
  const start = new Date(end);
  start.setDate(start.getDate() - weeksToShow * 7 + 1);

  const days: { key: string; count: number }[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    days.push({ key, count: byDay.get(key) ?? 0 });
  }
  const weeks: { key: string; count: number }[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  const max = Math.max(...data.map(d => d.count), 1);

  return (
    <View style={{ flexDirection: 'row', gap: 3 }}>
      {weeks.map((week, wi) => (
        <View key={wi} style={{ gap: 3 }}>
          {week.map(day => (
            <View
              key={day.key}
              style={{ width: 11, height: 11, borderRadius: 2, backgroundColor: HEAT_COLORS[bucketLevel(day.count, max)] }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

export default function AdminDashboardScreen() {
  const { getToken } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<AdminStats | null>(null);

  const load = useCallback(async () => {
    const tok = await getToken();
    if (!tok) return;
    getAdminStats(tok).then(setStats).catch(() => {});
  }, [getToken]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!stats) {
    return (
      <View style={[st.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={C.inkMute} />
      </View>
    );
  }

  const openReports = stats.reports_by_status.open;

  return (
    <ScrollView style={st.screen} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={st.grid}>
        <StatTile icon="people-outline" label="Total users" value={stats.total_users} onPress={() => router.push('/admin/users' as never)} />
        <StatTile icon="image-outline" label="Total posts" value={stats.total_posts} onPress={() => router.push('/admin/posts' as never)} />
        <StatTile icon="map-outline" label="Total visits" value={stats.total_visits} onPress={() => router.push('/admin/visits' as never)} />
        <StatTile icon="ribbon-outline" label="Badges earned" value={stats.total_badges} onPress={() => router.push('/admin/badges' as never)} />
        <StatTile icon="pulse-outline" label="Active (7d)" value={stats.active_users_7d} onPress={() => router.push('/admin/users?active=7' as never)} />
        <StatTile icon="pulse-outline" label="Active (30d)" value={stats.active_users_30d} onPress={() => router.push('/admin/users?active=30' as never)} />
      </View>

      <TouchableOpacity style={st.reportsBanner} onPress={() => router.push('/admin/reports' as never)} activeOpacity={0.75}>
        <Ionicons name="flag-outline" size={16} color={openReports > 0 ? '#C04040' : C.inkMute} />
        <Text style={[st.reportsBannerText, openReports > 0 && { color: '#C04040', fontWeight: '700' }]}>
          {openReports > 0 ? `${openReports} open report${openReports !== 1 ? 's' : ''} — review now` : 'No open reports'}
        </Text>
        <Ionicons name="chevron-forward" size={14} color={C.inkMute} />
      </TouchableOpacity>

      <View style={st.section}>
        <Text style={st.sectionTitle}>ACTIVITY — LAST ~4 MONTHS</Text>
        <View style={st.card}>
          <MiniHeatmap data={stats.activity_by_day} />
        </View>
      </View>

      <View style={st.section}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={st.sectionTitle}>TOP PARKS BY VISITS</Text>
          <TouchableOpacity onPress={() => router.push('/admin/parks' as never)}>
            <Text style={st.linkText}>All parks →</Text>
          </TouchableOpacity>
        </View>
        <View style={st.card}>
          {stats.top_parks.slice(0, 6).map(p => {
            const max = Math.max(...stats.top_parks.map(x => x.visit_count), 1);
            return (
              <View key={p.park_code} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Text style={{ width: 110, fontSize: 12.5, color: C.inkSoft }} numberOfLines={1}>{p.name}</Text>
                <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: C.hairlineSoft, overflow: 'hidden' }}>
                  <View style={{ width: `${(p.visit_count / max) * 100}%`, height: '100%', backgroundColor: C.visited, borderRadius: 3 }} />
                </View>
                <Text style={{ width: 28, textAlign: 'right', fontSize: 12.5, fontWeight: '700', color: C.ink }}>{p.visit_count}</Text>
              </View>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  tile: {
    width: '31%', backgroundColor: C.surface, borderRadius: 12,
    borderWidth: 0.5, borderColor: C.hairline, padding: 10, gap: 4,
  },
  tileIconBox: {
    width: 26, height: 26, borderRadius: 7, backgroundColor: C.hairlineSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  tileValue: { fontSize: 17, fontWeight: '800', color: C.ink },
  tileLabel: { fontSize: 10.5, fontWeight: '600', color: C.inkMute, textTransform: 'uppercase' },
  reportsBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.surface, borderRadius: 12,
    borderWidth: 0.5, borderColor: C.hairline, padding: 12, marginBottom: 18,
  },
  reportsBannerText: { flex: 1, fontSize: 13, color: C.inkSoft },
  section: { marginBottom: 18 },
  sectionTitle: { fontSize: 11.5, fontWeight: '700', color: C.inkMute, letterSpacing: 1, marginBottom: 8 },
  linkText: { fontSize: 12.5, fontWeight: '700', color: C.visited },
  card: {
    backgroundColor: C.surface, borderRadius: 12,
    borderWidth: 0.5, borderColor: C.hairline, padding: 14,
  },
});
