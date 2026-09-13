import {
  ActivityIndicator, Animated, PanResponder, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useRouter, Stack } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { AdminMenu } from '@/components/AdminMenu';
import { STATIC as C } from '@/lib/palette';
import { getAdminStats, getAdminUsage, type AdminStats, type AdminStatsRange, type AdminUsage } from '@/lib/api';

// Mirrors the desktop admin dashboard: live-presence pulse card, stat tiles
// with 24h deltas, DAU + App Store charts, the acquisition panel, activity
// heatmap, hourly mix, signups, moderation queue, top parks, usage gauges.

const GOOD = '#397D5E';
const BAD  = '#C04040';

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

function fmtBytes(bytes: number): string {
  if (bytes >= 1000 ** 3) return `${(bytes / 1000 ** 3).toFixed(2)} GB`;
  if (bytes >= 1000 ** 2) return `${(bytes / 1000 ** 2).toFixed(1)} MB`;
  return `${Math.round(bytes / 1000)} KB`;
}

// ── Pulse card — active now + presence windows, matches desktop PulseCard ─────

function LiveDot() {
  const ping = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(ping, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(ping, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [ping]);
  return (
    <View style={{ width: 10, height: 10 }}>
      <Animated.View style={{
        position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: GOOD,
        opacity: ping.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
        transform: [{ scale: ping.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) }],
      }} />
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: GOOD }} />
    </View>
  );
}

function PulseCard({ stats }: { stats: AdminStats }) {
  const windows = [
    { label: 'PAST HOUR', value: stats.active_users_1h },
    { label: 'PAST 24H',  value: stats.active_users_today },
    { label: 'PAST 7D',   value: stats.active_users_7d },
    { label: 'PAST 30D',  value: stats.active_users_30d },
  ];
  return (
    <View style={st.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <LiveDot />
        <Text style={st.kicker}>ACTIVE NOW</Text>
      </View>
      <Text style={st.pulseBig}>{stats.active_users_15m.toLocaleString()}</Text>
      <Text style={st.pulseSub}>users in the last 15 minutes</Text>
      <View style={st.pulseRow}>
        {windows.map(w => (
          <View key={w.label} style={{ alignItems: 'center', flex: 1 }}>
            <Text style={st.pulseWinVal}>{w.value.toLocaleString()}</Text>
            <Text style={st.pulseWinLabel}>{w.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Stat tiles with 24h delta badges ──────────────────────────────────────────

function DeltaBadge({ kind, value }: { kind: 'count' | 'percent'; value: number }) {
  const color = value > 0 ? GOOD : value < 0 ? BAD : C.inkMute;
  const text = kind === 'percent'
    ? `${value > 0 ? '↑' : value < 0 ? '↓' : ''}${Math.abs(value)}%`
    : value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : '±0';
  return <Text style={{ fontSize: 11, fontWeight: '700', color }}>{text}</Text>;
}

function StatTile({
  icon, label, value, onPress, accent, delta,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string; value: number; onPress: () => void; accent?: boolean;
  delta?: { kind: 'count' | 'percent'; value: number };
}) {
  return (
    <TouchableOpacity style={st.tile} onPress={onPress} activeOpacity={0.75}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={[st.tileIconBox, accent && { backgroundColor: `${BAD}1A` }]}>
          <Ionicons name={icon} size={15} color={accent ? BAD : C.visited} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={st.tileValue}>{value.toLocaleString()}</Text>
          <Text style={st.tileLabel} numberOfLines={1}>{label}</Text>
        </View>
        {delta && <DeltaBadge kind={delta.kind} value={delta.value} />}
      </View>
    </TouchableOpacity>
  );
}

// ── Bar chart — plain Views, null-aware (blank slot, no fake zero bar) ────────
// Scrubbable: press-and-drag across the bars to read the exact value out of a
// reserved label row above the chart (no absolute positioning, so nothing can
// clip against a card's edges).

const defaultAxisLabel = (bucket: string) => bucket.slice(5).replace('-', '/');

function BarChart({
  data, height = 96, color = C.visited, formatAxis = defaultAxisLabel, formatValue,
}: {
  data: { day: string; value: number | null }[]; height?: number; color?: import('react-native').ColorValue;
  formatAxis?: (bucket: string) => string; formatValue?: (bucket: string, value: number | null) => string;
}) {
  const values = data.map(d => d.value).filter((v): v is number => v != null);
  const max = Math.max(...values, 1);
  const first = data[0] ? formatAxis(data[0].day) : '';
  const last  = data.length ? formatAxis(data[data.length - 1].day) : '';

  const [width, setWidth] = useState(0);
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);

  const updateScrub = useCallback((x: number) => {
    if (width <= 0 || data.length === 0) return;
    setScrubIndex(Math.min(data.length - 1, Math.max(0, Math.floor((x / width) * data.length))));
  }, [width, data.length]);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: e => updateScrub(e.nativeEvent.locationX),
      onPanResponderMove: e => updateScrub(e.nativeEvent.locationX),
      onPanResponderRelease: () => setScrubIndex(null),
      onPanResponderTerminate: () => setScrubIndex(null),
    }),
  ).current;

  const active = scrubIndex != null ? data[scrubIndex] : null;
  const activeLabel = active
    ? (formatValue ? formatValue(active.day, active.value) : `${active.value?.toLocaleString() ?? '—'} · ${formatAxis(active.day)}`)
    : null;

  return (
    <View>
      <View style={{ height: 16, marginBottom: 4, justifyContent: 'center' }}>
        {activeLabel && <Text style={st.scrubLabel}>{activeLabel}</Text>}
      </View>
      <View
        onLayout={e => setWidth(e.nativeEvent.layout.width)}
        style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height }}
        {...responder.panHandlers}
      >
        {data.map((d, i) => (
          <View key={d.day} style={{ flex: 1, height: '100%', justifyContent: 'flex-end' }}>
            {d.value != null && (
              <View style={{
                height: Math.max((d.value / max) * height, d.value > 0 ? 3 : 1),
                borderRadius: 2,
                backgroundColor: d.value > 0 ? color : C.hairlineSoft,
                opacity: scrubIndex != null && scrubIndex !== i ? 0.4 : 1,
              }} />
            )}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
        <Text style={st.axisLabel}>{first}</Text>
        <Text style={st.axisLabel}>peak {max.toLocaleString()}</Text>
        <Text style={st.axisLabel}>{last}</Text>
      </View>
    </View>
  );
}

// ── App Store acquisition panel ───────────────────────────────────────────────

function AcquisitionCard({ stats }: { stats: AdminStats }) {
  const days = stats.app_store_by_day;
  const hasData =
    stats.app_store_impressions_30d > 0 ||
    stats.app_store_page_views_30d > 0 ||
    stats.app_store_first_time_downloads_30d > 0 ||
    stats.app_store_redownloads_30d > 0;

  if (!hasData) {
    return (
      <View style={st.card}>
        <Text style={st.emptyText}>
          No analytics yet — data appears once App Store Connect publishes its first daily reports (~48h behind).
        </Text>
      </View>
    );
  }

  const metrics = [
    { label: 'FIRST-TIME DOWNLOADS', total: stats.app_store_first_time_downloads_30d.toLocaleString(), data: days.map(d => ({ day: d.day, value: d.first_time_downloads })) },
    { label: 'REDOWNLOADS',          total: stats.app_store_redownloads_30d.toLocaleString(),          data: days.map(d => ({ day: d.day, value: d.redownloads })) },
    { label: 'CONVERSION RATE',      total: stats.app_store_conversion_30d != null ? `${stats.app_store_conversion_30d}%` : '—', data: days.map(d => ({ day: d.day, value: d.conversion })) },
    { label: 'IMPRESSIONS',          total: stats.app_store_impressions_30d.toLocaleString(),          data: days.map(d => ({ day: d.day, value: d.impressions })) },
    { label: 'PRODUCT PAGE VIEWS',   total: stats.app_store_page_views_30d.toLocaleString(),           data: days.map(d => ({ day: d.day, value: d.page_views })) },
  ];
  const deviceMax = Math.max(...stats.app_store_devices_30d.map(d => d.downloads), 1);

  return (
    <View style={st.card}>
      <Text style={st.cardHint}>
        Last 30 days from App Store Connect (published ~48h behind). Conversion is downloads ÷ unique impressions.
      </Text>
      {metrics.map(m => (
        <View key={m.label} style={{ marginTop: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <Text style={st.metricLabel}>{m.label}</Text>
            <Text style={st.metricTotal}>{m.total}</Text>
          </View>
          <BarChart data={m.data} height={34} />
        </View>
      ))}
      {stats.app_store_devices_30d.length > 0 && (
        <View style={{ marginTop: 16, borderTopWidth: 0.5, borderTopColor: C.hairline, paddingTop: 12 }}>
          <Text style={[st.metricLabel, { marginBottom: 8 }]}>DOWNLOADS BY DEVICE</Text>
          {stats.app_store_devices_30d.map(d => (
            <View key={d.device} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 7 }}>
              <Text style={{ width: 78, fontSize: 12.5, color: C.inkSoft }} numberOfLines={1}>{d.device}</Text>
              <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: C.hairlineSoft, overflow: 'hidden' }}>
                <View style={{ width: `${(d.downloads / deviceMax) * 100}%`, height: '100%', backgroundColor: C.visited, borderRadius: 3 }} />
              </View>
              <Text style={{ width: 40, textAlign: 'right', fontSize: 12.5, fontWeight: '700', color: C.ink }}>
                {d.downloads.toLocaleString()}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Activity heatmap (trailing ~4 months) ─────────────────────────────────────

function MiniHeatmap({ data }: { data: { day: string; count: number }[] }) {
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

// ── Hourly activity (ET) ──────────────────────────────────────────────────────

function hourLabel(h: number): string {
  const period = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${period}`;
}

function HourlyChart({ data }: { data: AdminStats['hourly_activity'] }) {
  const max = Math.max(...data.map(h => h.active_users), 1);
  const height = 72;

  const [width, setWidth] = useState(0);
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);

  const updateScrub = useCallback((x: number) => {
    if (width <= 0 || data.length === 0) return;
    setScrubIndex(Math.min(data.length - 1, Math.max(0, Math.floor((x / width) * data.length))));
  }, [width, data.length]);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: e => updateScrub(e.nativeEvent.locationX),
      onPanResponderMove: e => updateScrub(e.nativeEvent.locationX),
      onPanResponderRelease: () => setScrubIndex(null),
      onPanResponderTerminate: () => setScrubIndex(null),
    }),
  ).current;

  const active = scrubIndex != null ? data[scrubIndex] : null;

  return (
    <View>
      <View style={{ height: 16, marginBottom: 4, justifyContent: 'center' }}>
        {active && (
          <Text style={st.scrubLabel}>
            {active.active_users.toLocaleString()} active · {active.posts} posts · {active.likes} likes · {active.comments} comments at {hourLabel(active.hour)} ET
          </Text>
        )}
      </View>
      <View
        onLayout={e => setWidth(e.nativeEvent.layout.width)}
        style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height }}
        {...responder.panHandlers}
      >
        {data.map((h, i) => (
          <View key={h.hour} style={{ flex: 1, height: '100%', justifyContent: 'flex-end' }}>
            <View style={{
              height: Math.max((h.active_users / max) * height, h.active_users > 0 ? 3 : 1),
              borderRadius: 2,
              backgroundColor: h.active_users > 0 ? C.visited : C.hairlineSoft,
              opacity: scrubIndex != null && scrubIndex !== i ? 0.4 : 1,
            }} />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
        <Text style={st.axisLabel}>12am</Text>
        <Text style={st.axisLabel}>6am</Text>
        <Text style={st.axisLabel}>12pm</Text>
        <Text style={st.axisLabel}>6pm</Text>
        <Text style={st.axisLabel}>11pm</Text>
      </View>
    </View>
  );
}

// ── Moderation queue status bar ───────────────────────────────────────────────

function ReportsStatusBar({ status }: { status: AdminStats['reports_by_status'] }) {
  const total = status.open + status.actioned + status.dismissed;
  const segs = [
    { label: 'Open',      value: status.open,      color: BAD },
    { label: 'Actioned',  value: status.actioned,  color: C.visited },
    { label: 'Dismissed', value: status.dismissed, color: C.inkMute },
  ];
  return (
    <View>
      <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: C.hairlineSoft }}>
        {total > 0 && segs.map(s => (
          s.value > 0 ? <View key={s.label} style={{ flex: s.value, backgroundColor: s.color }} /> : null
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 14, marginTop: 8 }}>
        {segs.map(s => (
          <View key={s.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: s.color }} />
            <Text style={{ fontSize: 12, color: C.inkSoft }}>{s.label} <Text style={{ fontWeight: '700', color: C.ink }}>{s.value}</Text></Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Usage gauges ──────────────────────────────────────────────────────────────

function UsageGauge({ label, used, limit, note }: { label: string; used: number; limit: number; note?: string }) {
  const pct = Math.min(100, (used / limit) * 100);
  const color = pct > 85 ? BAD : pct > 60 ? '#C56B3D' : C.visited;
  const pctStr = pct.toFixed(pct < 1 ? 2 : 1);
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
        <Text style={st.metricLabel}>{label}</Text>
        <Text style={{ fontSize: 12, color: C.inkSoft }}>
          <Text style={{ fontWeight: '700', color: C.ink }}>{fmtBytes(used)}</Text> / {fmtBytes(limit)} · {pctStr}%{note ? ` · ${note}` : ''}
        </Text>
      </View>
      <View style={{ height: 7, borderRadius: 4, backgroundColor: C.hairlineSoft, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: 4 }} />
      </View>
    </View>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, hint, link, onLink, children }: {
  title: string; hint?: string; link?: string; onLink?: () => void; children: React.ReactNode;
}) {
  return (
    <View style={st.section}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={st.sectionTitle}>{title}</Text>
        {link && onLink && (
          <TouchableOpacity onPress={onLink}>
            <Text style={st.linkText}>{link}</Text>
          </TouchableOpacity>
        )}
      </View>
      {hint ? <Text style={st.sectionHint}>{hint}</Text> : null}
      {children}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

const RANGE_OPTIONS: { key: AdminStatsRange; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7D' },
  { key: '30d', label: '30D' },
  { key: 'year', label: 'Year' },
];
const RANGE_LABEL: Record<AdminStatsRange, string> = {
  today: 'today', '7d': '7 days', '30d': '30 days', year: '12 months',
};

function formatBucketAxis(range: AdminStatsRange, bucket: string): string {
  if (range === 'today') return bucket;
  if (range === 'year') {
    const [y, m] = bucket.split('-');
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'short' });
  }
  return bucket.slice(5).replace('-', '/');
}

function formatBucketFull(range: AdminStatsRange, bucket: string): string {
  if (range === 'today') return `${bucket} ET`;
  if (range === 'year') {
    const [y, m] = bucket.split('-');
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  return new Date(`${bucket}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function RangePicker({ value, onChange }: { value: AdminStatsRange; onChange: (r: AdminStatsRange) => void }) {
  return (
    <View style={st.rangeRow}>
      {RANGE_OPTIONS.map(opt => (
        <TouchableOpacity
          key={opt.key}
          onPress={() => onChange(opt.key)}
          activeOpacity={0.75}
          style={[st.rangeChip, value === opt.key && st.rangeChipActive]}
        >
          <Text style={[st.rangeChipText, value === opt.key && st.rangeChipTextActive]}>{opt.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function AdminDashboardScreen() {
  const { getToken } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [usage, setUsage] = useState<AdminUsage | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [range, setRange] = useState<AdminStatsRange>('7d');

  const load = useCallback(async (r: AdminStatsRange) => {
    const tok = await getToken();
    if (!tok) return;
    getAdminStats(tok, r).then(setStats).catch(() => {});
    // R2 usage lists the whole bucket — slower, so it loads independently.
    getAdminUsage(tok).then(setUsage).catch(() => {});
  }, [getToken]);

  useFocusEffect(useCallback(() => { load(range); }, [load, range]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(range);
    setRefreshing(false);
  }, [load, range]);

  if (!stats) {
    return (
      <>
        <Stack.Screen options={{ headerRight: () => <AdminMenu /> }} />
        <View style={[st.screen, { alignItems: 'center', justifyContent: 'center' }]}>
          <ActivityIndicator color={C.inkMute} />
        </View>
      </>
    );
  }

  const openReports = stats.reports_by_status.open;

  return (
    <>
      <Stack.Screen options={{ headerRight: () => <AdminMenu /> }} />
      <ScrollView
      style={st.screen}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <PulseCard stats={stats} />

      <RangePicker value={range} onChange={setRange} />

      <View style={st.grid}>
        <StatTile icon="people-outline" label="Total users" value={stats.total_users} delta={{ kind: 'count', value: stats.range_totals.users }} onPress={() => router.push('/admin/users' as never)} />
        <StatTile icon="person-add-outline" label={`Signups (${RANGE_LABEL[range]})`} value={stats.range_totals.users} delta={{ kind: 'percent', value: stats.range_deltas.users }} onPress={() => router.push('/admin/users' as never)} />
        <StatTile icon="download-outline" label={`Downloads (${RANGE_LABEL[range]})`} value={stats.range_totals.app_store_units} delta={{ kind: 'percent', value: stats.range_deltas.app_store_units }} onPress={() => router.push('/admin/visits' as never)} />
        <StatTile icon="flag-outline" label="Open reports" value={openReports} accent={openReports > 0} delta={{ kind: 'count', value: stats.range_totals.reports }} onPress={() => router.push('/admin/reports' as never)} />
        <StatTile icon="image-outline" label="Total posts" value={stats.total_posts} delta={{ kind: 'count', value: stats.range_totals.posts }} onPress={() => router.push('/admin/posts' as never)} />
        <StatTile icon="map-outline" label="Total visits" value={stats.total_visits} delta={{ kind: 'count', value: stats.range_totals.visits }} onPress={() => router.push('/admin/visits' as never)} />
        <StatTile icon="heart-outline" label="Likes" value={stats.total_likes} delta={{ kind: 'count', value: stats.range_totals.likes }} onPress={() => router.push('/admin/posts' as never)} />
        <StatTile icon="chatbubble-outline" label="Comments" value={stats.total_comments} delta={{ kind: 'count', value: stats.range_totals.comments }} onPress={() => router.push('/admin/posts' as never)} />
        <StatTile icon="ribbon-outline" label="Badges earned" value={stats.total_badges} delta={{ kind: 'count', value: stats.range_totals.badges }} onPress={() => router.push('/admin/badges' as never)} />
        <StatTile icon="people-circle-outline" label="Friendships" value={stats.total_friendships} delta={{ kind: 'count', value: stats.range_totals.friendships }} onPress={() => router.push('/admin/users' as never)} />
      </View>

      <TouchableOpacity style={st.reportsBanner} onPress={() => router.push('/admin/reports' as never)} activeOpacity={0.75}>
        <Ionicons name="flag-outline" size={16} color={openReports > 0 ? BAD : C.inkMute} />
        <Text style={[st.reportsBannerText, openReports > 0 && { color: BAD, fontWeight: '700' }]}>
          {openReports > 0 ? `${openReports} open report${openReports !== 1 ? 's' : ''} — review now` : 'No open reports'}
        </Text>
        <Ionicons name="chevron-forward" size={14} color={C.inkMute} />
      </TouchableOpacity>

      <Section title={`ACTIVE USERS — ${RANGE_LABEL[range].toUpperCase()}`}>
        <View style={st.card}>
          <BarChart
            data={stats.range_series.map(x => ({ day: x.bucket, value: x.active_users }))}
            formatAxis={b => formatBucketAxis(range, b)}
            formatValue={(b, v) => `${v?.toLocaleString() ?? '—'} active · ${formatBucketFull(range, b)}`}
          />
        </View>
      </Section>

      <Section
        title="APP STORE DOWNLOADS"
        hint={`${stats.range_totals.app_store_units.toLocaleString()} units — ${RANGE_LABEL[range]}`}
      >
        <View style={st.card}>
          {stats.range_totals.app_store_units > 0 ? (
            <BarChart
              data={stats.range_series.map(x => ({ day: x.bucket, value: x.app_store_units }))}
              formatAxis={b => formatBucketAxis(range, b)}
              formatValue={(b, v) => `${v?.toLocaleString() ?? '—'} units · ${formatBucketFull(range, b)}`}
            />
          ) : (
            <Text style={st.emptyText}>No data yet — App Store Connect publishes reports ~48h behind, so a narrow range often has none.</Text>
          )}
        </View>
      </Section>

      <Section title="APP STORE ACQUISITION">
        <AcquisitionCard stats={stats} />
      </Section>

      <Section title="ACTIVITY — LAST ~4 MONTHS">
        <View style={st.card}>
          <MiniHeatmap data={stats.activity_by_day} />
        </View>
      </Section>

      <Section
        title="ACTIVITY BY HOUR OF DAY"
        hint="All actions from the last 30 days, summed into each hour (Eastern time)"
      >
        <View style={st.card}>
          <HourlyChart data={stats.hourly_activity} />
        </View>
      </Section>

      <Section title={`SIGNUPS — ${RANGE_LABEL[range].toUpperCase()}`}>
        <View style={st.card}>
          <BarChart
            data={stats.range_series.map(x => ({ day: x.bucket, value: x.signups }))}
            height={72}
            formatAxis={b => formatBucketAxis(range, b)}
            formatValue={(b, v) => `${v?.toLocaleString() ?? '—'} signups · ${formatBucketFull(range, b)}`}
          />
        </View>
      </Section>

      <Section title="MODERATION QUEUE" link="View queue →" onLink={() => router.push('/admin/reports' as never)}>
        <View style={st.card}>
          <ReportsStatusBar status={stats.reports_by_status} />
        </View>
      </Section>

      <Section title="TOP PARKS BY VISITS" link="All parks →" onLink={() => router.push('/admin/parks' as never)}>
        <View style={st.card}>
          {stats.top_parks.slice(0, 8).map(p => {
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
      </Section>

      <Section title="USAGE & LIMITS">
        <View style={st.card}>
          {usage ? (
            <>
              <UsageGauge
                label="DATABASE (NEON)"
                used={usage.database.used_bytes}
                limit={usage.database.limit_bytes}
                note={usage.database.approximate ? 'approx' : undefined}
              />
              <UsageGauge
                label="PHOTO STORAGE (R2)"
                used={usage.storage.used_bytes}
                limit={usage.storage.limit_bytes}
                note={`${usage.storage.object_count.toLocaleString()} objects`}
              />
            </>
          ) : (
            <ActivityIndicator color={C.inkMute} />
          )}
        </View>
      </Section>
      </ScrollView>
    </>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },

  card: {
    backgroundColor: C.surface, borderRadius: 12,
    borderWidth: 0.5, borderColor: C.hairline, padding: 14,
  },
  kicker: { fontSize: 11, fontWeight: '700', color: C.inkMute, letterSpacing: 1 },
  cardHint: { fontSize: 12, color: C.inkMute, lineHeight: 16 },
  emptyText: { fontSize: 13, color: C.inkMute, lineHeight: 18 },
  axisLabel: { fontSize: 10, color: C.inkMute },
  scrubLabel: { fontSize: 11.5, fontWeight: '700', color: C.ink },

  // Range picker
  rangeRow: { flexDirection: 'row', gap: 6, marginTop: 14 },
  rangeChip: {
    flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 8,
    borderWidth: 0.5, borderColor: C.hairline, backgroundColor: C.surface,
  },
  rangeChipActive: { backgroundColor: C.ink, borderColor: C.ink },
  rangeChipText: { fontSize: 12.5, fontWeight: '700', color: C.inkSoft },
  rangeChipTextActive: { color: C.surface },

  // Pulse card
  pulseBig: { fontSize: 38, fontWeight: '800', color: C.ink, letterSpacing: -1, marginTop: 6, lineHeight: 42 },
  pulseSub: { fontSize: 12, color: C.inkMute, marginTop: 1 },
  pulseRow: {
    flexDirection: 'row', marginTop: 14, paddingTop: 12,
    borderTopWidth: 0.5, borderTopColor: C.hairline,
  },
  pulseWinVal: { fontSize: 20, fontWeight: '800', color: C.ink, letterSpacing: -0.4 },
  pulseWinLabel: { fontSize: 10, fontWeight: '600', color: C.inkMute, letterSpacing: 0.4, marginTop: 2 },

  // Tiles
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14, marginBottom: 14 },
  tile: {
    width: '48.4%', backgroundColor: C.surface, borderRadius: 12,
    borderWidth: 0.5, borderColor: C.hairline, padding: 11,
  },
  tileIconBox: {
    width: 28, height: 28, borderRadius: 8, backgroundColor: C.hairlineSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  tileValue: { fontSize: 17, fontWeight: '800', color: C.ink, letterSpacing: -0.3 },
  tileLabel: { fontSize: 10, fontWeight: '600', color: C.inkMute, textTransform: 'uppercase', letterSpacing: 0.3 },

  reportsBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.surface, borderRadius: 12,
    borderWidth: 0.5, borderColor: C.hairline, padding: 12, marginBottom: 18,
  },
  reportsBannerText: { flex: 1, fontSize: 13, color: C.inkSoft },

  section: { marginBottom: 18 },
  sectionTitle: { fontSize: 11.5, fontWeight: '700', color: C.inkMute, letterSpacing: 1, marginBottom: 8 },
  sectionHint: { fontSize: 11.5, color: C.inkMute, marginTop: -4, marginBottom: 8 },
  linkText: { fontSize: 12.5, fontWeight: '700', color: C.visited },

  // Metric rows (acquisition)
  metricLabel: { fontSize: 10.5, fontWeight: '700', color: C.inkMute, letterSpacing: 0.5 },
  metricTotal: { fontSize: 15, fontWeight: '800', color: C.ink },
});
