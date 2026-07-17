import Link from 'next/link';
import { headers } from 'next/headers';
import {
  Users, Image as ImageIcon, MapPin, Award, Flag, UserPlus, Download, HeartHandshake,
  ArrowUpRight, ArrowDownRight, Heart, MessageCircle,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import {
  SignupsChart, ContributionHeatmap, ActivityInsights, ReportsStatusBar, TopParksList, HourlyActivityChart,
  DailyActiveUsersChart, AppStoreDownloadsChart, AppStoreMetricChart, DeviceDonutChart,
} from './AdminCharts';
import { UsageGauges } from './UsageGauges';

interface Stats {
  total_users: number;
  total_posts: number;
  total_visits: number;
  total_badges: number;
  total_likes: number;
  total_comments: number;
  total_friendships: number;
  active_users_15m: number;
  active_users_1h: number;
  active_users_today: number;
  active_users_7d: number;
  active_users_30d: number;
  signups_by_day: { day: string; count: number }[];
  dau_30d: { day: string; count: number }[];
  activity_by_day: { day: string; count: number }[];
  reports_by_status: { open: number; actioned: number; dismissed: number };
  top_parks: { park_code: string; name: string; visit_count: number }[];
  hourly_activity: { hour: number; active_users: number; posts: number; likes: number; comments: number; visits: number }[];
  app_store_by_day: {
    day: string; units: number; proceeds: number; impressions: number;
    page_views: number; first_time_downloads: number; redownloads: number; conversion: number | null;
  }[];
  app_store_units_30d: number;
  app_store_proceeds_30d: number;
  app_store_impressions_30d: number;
  app_store_page_views_30d: number;
  app_store_first_time_downloads_30d: number;
  app_store_redownloads_30d: number;
  app_store_conversion_30d: number | null;
  app_store_devices_30d: { device: string; downloads: number }[];
  deltas_24h: {
    users: number; posts: number; visits: number;
    badges: number; likes: number; comments: number; friendships: number; reports: number;
  };
}

async function getStats(): Promise<Stats> {
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('host');
  const res = await fetch(`${proto}://${host}/api/admin/stats`, {
    headers: { cookie: h.get('cookie') ?? '' },
    cache: 'no-store',
  });
  return res.json();
}

// Live-presence hero: the 15-minute number is the "is anyone on right now"
// glance, the four windows alongside replace the old cramped toggle card
// (all visible at once — no clicking through to compare).
function PulseCard({ stats }: { stats: Stats }) {
  const windows = [
    { label: 'Past hour', value: stats.active_users_1h },
    { label: 'Past 24h', value: stats.active_users_today },
    { label: 'Past 7d', value: stats.active_users_7d },
    { label: 'Past 30d', value: stats.active_users_30d },
  ];
  return (
    <Card className="border-hairline p-5 shadow-[var(--shadow-card)]">
      <div className="flex flex-col gap-6 md:flex-row md:items-center">
        <div className="shrink-0 md:w-56 md:border-r md:border-hairline md:pr-6">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: 'var(--status-good)' }} />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: 'var(--status-good)' }} />
            </span>
            <span className="text-[11px] font-bold uppercase tracking-wide text-ink-mute">Active now</span>
          </div>
          <div className="mt-1 text-4xl font-extrabold leading-none tracking-tight text-ink">
            {stats.active_users_15m.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-ink-mute">users in the last 15 minutes</div>
        </div>
        {/* Evenly distributed across the card's remaining width — this row
            is what fills the right side on desktop. */}
        <div className="flex flex-1 items-center justify-between text-center md:justify-around">
          {windows.map(w => (
            <div key={w.label}>
              <div className="text-3xl font-extrabold leading-tight tracking-tight text-ink">{w.value.toLocaleString()}</div>
              <div className="mt-0.5 text-[10px] font-semibold uppercase leading-snug tracking-wide text-ink-mute">{w.label}</div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

// 24h change badge for a stat tile. Two flavors:
//  - 'count':   green +N / red −N (new rows in the last day)
//  - 'percent': green ↑X% / red ↓X% (today vs. yesterday)
// Zero renders muted so a quiet day doesn't paint the dashboard green/red.
function DeltaBadge({ kind, value }: { kind: 'count' | 'percent'; value: number }) {
  const color = value > 0 ? 'var(--status-good)' : value < 0 ? 'var(--destructive)' : 'var(--ink-mute)';
  return (
    <span className="ml-auto flex shrink-0 items-center gap-0.5 text-[11px] font-bold" style={{ color }} title="Change over the past day">
      {kind === 'percent' && value > 0 && <ArrowUpRight size={12} strokeWidth={2.5} />}
      {kind === 'percent' && value < 0 && <ArrowDownRight size={12} strokeWidth={2.5} />}
      {kind === 'percent'
        ? `${Math.abs(value)}%`
        : value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : '±0'}
    </span>
  );
}

// Compact horizontal tile — icon beside the number instead of the old tall
// card with a floating icon and dead space under it.
function StatCard({
  href, icon: Icon, label, value, accent, delta,
}: {
  href: string; icon: React.ElementType; label: string; value: number; accent?: boolean;
  delta?: { kind: 'count' | 'percent'; value: number };
}) {
  return (
    <Link href={href} className="block">
      <Card className="group flex-row items-center gap-3 border-hairline p-3 shadow-[var(--shadow-card)] transition-transform hover:-translate-y-0.5">
        <span className={`shrink-0 rounded-md p-2 ${accent ? 'bg-destructive/10 text-destructive' : 'bg-surface-alt text-primary'}`}>
          <Icon size={15} strokeWidth={2.25} />
        </span>
        <div className="min-w-0">
          <div className="text-lg font-extrabold leading-tight tracking-tight text-ink">{value.toLocaleString()}</div>
          <div className="truncate text-[10px] font-semibold uppercase leading-snug tracking-wide text-ink-mute">{label}</div>
        </div>
        {delta && <DeltaBadge kind={delta.kind} value={delta.value} />}
      </Card>
    </Link>
  );
}

// App Store Connect-style acquisition panel: five 30-day metrics with mini
// daily charts, plus the downloads-by-device donut. All of it comes from
// Apple's Analytics Reports pipeline, which lags ~48h and starts empty until
// the cron's report request has produced its first data.
function AcquisitionCard({ stats }: { stats: Stats }) {
  const days = stats.app_store_by_day;
  const hasData =
    stats.app_store_impressions_30d > 0 ||
    stats.app_store_page_views_30d > 0 ||
    stats.app_store_first_time_downloads_30d > 0 ||
    stats.app_store_redownloads_30d > 0;

  const metrics = [
    {
      label: 'First-time downloads',
      total: stats.app_store_first_time_downloads_30d.toLocaleString(),
      data: days.map(d => ({ day: d.day, value: d.first_time_downloads })),
    },
    {
      label: 'Redownloads',
      total: stats.app_store_redownloads_30d.toLocaleString(),
      data: days.map(d => ({ day: d.day, value: d.redownloads })),
    },
    {
      label: 'Conversion rate',
      total: stats.app_store_conversion_30d != null ? `${stats.app_store_conversion_30d}%` : '—',
      data: days.map(d => ({ day: d.day, value: d.conversion ?? 0 })),
      unit: '%',
    },
    {
      label: 'Impressions',
      total: stats.app_store_impressions_30d.toLocaleString(),
      data: days.map(d => ({ day: d.day, value: d.impressions })),
    },
    {
      label: 'Product page views',
      total: stats.app_store_page_views_30d.toLocaleString(),
      data: days.map(d => ({ day: d.day, value: d.page_views })),
    },
  ];

  return (
    <Card className="border-hairline p-5 shadow-[var(--shadow-card)]">
      <h2 className="text-sm font-bold uppercase tracking-wide text-ink-mute">App Store acquisition</h2>
      <p className="mb-4 mt-1 text-xs text-ink-mute">
        Last 30 days, from App Store Connect analytics (published ~48h behind). Conversion is downloads ÷ unique impressions.
      </p>
      {hasData ? (
        <div className="flex flex-col gap-5">
          <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-5">
            {metrics.map(m => (
              <div key={m.label}>
                <div className="text-[10px] font-semibold uppercase leading-snug tracking-wide text-ink-mute">{m.label}</div>
                <div className="mb-2 text-xl font-extrabold leading-tight tracking-tight text-ink">{m.total}</div>
                <AppStoreMetricChart data={m.data} unit={m.unit} />
              </div>
            ))}
          </div>
          {stats.app_store_devices_30d.length > 0 && (
            <div className="border-t border-hairline pt-4">
              <div className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-ink-mute">Downloads by device</div>
              <div className="max-w-sm">
                <DeviceDonutChart data={stats.app_store_devices_30d} />
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-ink-mute">
          No analytics yet — the daily cron registers the report request with Apple on its first run,
          and data appears once the first daily reports are generated (~48h).
        </p>
      )}
    </Card>
  );
}

export default async function AdminDashboardPage() {
  const stats = await getStats();
  const d = stats.deltas_24h;

  // Day-over-day percentages, derived from the zero-filled series (last
  // entry = today-so-far, one before = full yesterday).
  const pctChange = (curr: number, prev: number) =>
    Math.round(((curr - prev) / Math.max(prev, 1)) * 100);
  const signupsPct = pctChange(
    stats.signups_by_day.at(-1)?.count ?? 0,
    stats.signups_by_day.at(-2)?.count ?? 0,
  );
  // Apple's reports lag ~48h, so "day over day" means the two most recent
  // days that actually have data, not literal today/yesterday.
  const reportedDays = stats.app_store_by_day.filter(x => x.units > 0);
  const downloadsPct = reportedDays.length >= 2
    ? pctChange(reportedDays.at(-1)!.units, reportedDays.at(-2)!.units)
    : undefined;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">Dashboard</h1>
        <p className="mt-1 text-sm text-ink-mute">Click any card for the full breakdown.</p>
      </div>

      <PulseCard stats={stats} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
        <StatCard href="/admin/users" icon={Users} label="Total users" value={stats.total_users} delta={{ kind: 'count', value: d.users }} />
        <StatCard
          href="/admin/users"
          icon={UserPlus}
          label="Signups (30d)"
          value={stats.signups_by_day.reduce((sum, x) => sum + x.count, 0)}
          delta={{ kind: 'percent', value: signupsPct }}
        />
        <StatCard
          href="/admin/visits"
          icon={Download}
          label="Downloads (30d)"
          value={stats.app_store_units_30d}
          delta={downloadsPct !== undefined ? { kind: 'percent', value: downloadsPct } : undefined}
        />
        <StatCard
          href="/admin/reports"
          icon={Flag}
          label="Open reports"
          value={stats.reports_by_status.open}
          accent={stats.reports_by_status.open > 0}
          delta={{ kind: 'count', value: d.reports }}
        />
        <StatCard href="/admin/posts" icon={ImageIcon} label="Total posts" value={stats.total_posts} delta={{ kind: 'count', value: d.posts }} />
        <StatCard href="/admin/visits" icon={MapPin} label="Total visits" value={stats.total_visits} delta={{ kind: 'count', value: d.visits }} />
        <StatCard href="/admin/posts" icon={Heart} label="Likes" value={stats.total_likes} delta={{ kind: 'count', value: d.likes }} />
        <StatCard href="/admin/posts" icon={MessageCircle} label="Comments" value={stats.total_comments} delta={{ kind: 'count', value: d.comments }} />
        <StatCard href="/admin/badges" icon={Award} label="Badges earned" value={stats.total_badges} delta={{ kind: 'count', value: d.badges }} />
        <StatCard href="/admin/users" icon={HeartHandshake} label="Friendships" value={stats.total_friendships} delta={{ kind: 'count', value: d.friendships }} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-hairline p-5 shadow-[var(--shadow-card)]">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-ink-mute">Active users — last 30 days</h2>
          <DailyActiveUsersChart data={stats.dau_30d} />
        </Card>

        <Card className="border-hairline p-5 shadow-[var(--shadow-card)]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-ink-mute">App Store downloads</h2>
            <div className="flex items-center gap-1.5 text-xs text-ink-mute">
              <Download size={13} />
              <span className="font-semibold text-ink">{stats.app_store_units_30d.toLocaleString()}</span>
              units in 30d
            </div>
          </div>
          {stats.app_store_units_30d > 0 ? (
            <AppStoreDownloadsChart data={stats.app_store_by_day} />
          ) : (
            <p className="text-sm text-ink-mute">
              No data yet — the daily cron backfills this once App Store Connect has published a report.
            </p>
          )}
        </Card>
      </div>

      <AcquisitionCard stats={stats} />

      <Card className="border-hairline p-5 shadow-[var(--shadow-card)]">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-ink-mute">Activity — last 12 months</h2>
        <div className="flex flex-col gap-6 md:flex-row md:items-start">
          <div className="min-w-0 flex-1">
            <ContributionHeatmap data={stats.activity_by_day} />
          </div>
          <div className="shrink-0 border-hairline md:border-l md:pl-6">
            <ActivityInsights data={stats.activity_by_day} />
          </div>
        </div>
      </Card>

      <Card className="border-hairline p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-sm font-bold uppercase tracking-wide text-ink-mute">
          Activity by hour of day
        </h2>
        <p className="mb-4 mt-1 text-xs text-ink-mute">
          All actions from the last 30 days, summed into each hour of day (Eastern time) — not a single day&apos;s timeline.
        </p>
        <HourlyActivityChart data={stats.hourly_activity} />
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-hairline p-5 shadow-[var(--shadow-card)]">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-ink-mute">Signups — last 30 days</h2>
          <SignupsChart data={stats.signups_by_day} />
        </Card>

        <Card className="border-hairline p-5 shadow-[var(--shadow-card)]">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-ink-mute">Moderation queue</h2>
          <ReportsStatusBar status={stats.reports_by_status} />
          <Link href="/admin/reports" className="mt-4 inline-block text-xs font-semibold text-primary hover:underline">
            View reports queue →
          </Link>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-hairline p-5 shadow-[var(--shadow-card)]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-ink-mute">Top parks by visits</h2>
            <Link href="/admin/parks" className="text-xs font-semibold text-primary hover:underline">All parks →</Link>
          </div>
          <TopParksList parks={stats.top_parks} />
        </Card>

        <Card className="border-hairline p-5 shadow-[var(--shadow-card)]">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-ink-mute">Usage &amp; limits</h2>
          <UsageGauges />
        </Card>
      </div>
    </div>
  );
}
