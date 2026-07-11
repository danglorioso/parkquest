import Link from 'next/link';
import { headers } from 'next/headers';
import { Users, Image as ImageIcon, MapPin, Award, Flag, UserPlus, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import {
  SignupsChart, ContributionHeatmap, ActivityInsights, ReportsStatusBar, TopParksList, HourlyActivityChart,
  DailyActiveUsersChart,
} from './AdminCharts';
import { ActiveUsersCard } from './ActiveUsersCard';
import { UsageGauges } from './UsageGauges';

interface Stats {
  total_users: number;
  total_posts: number;
  total_visits: number;
  total_badges: number;
  active_users_1h: number;
  active_users_today: number;
  active_users_7d: number;
  active_users_30d: number;
  signups_by_day: { day: string; count: number }[];
  activity_by_day: { day: string; count: number }[];
  reports_by_status: { open: number; actioned: number; dismissed: number };
  top_parks: { park_code: string; name: string; visit_count: number }[];
  hourly_activity: { hour: number; active_users: number; posts: number; likes: number; comments: number; visits: number }[];
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

function StatCard({
  href, icon: Icon, label, value, accent,
}: { href: string; icon: React.ElementType; label: string; value: number; accent?: boolean }) {
  return (
    <Link href={href}>
      <Card className="group relative cursor-pointer items-start gap-2 border-hairline p-3.5 shadow-[var(--shadow-card)] transition-transform hover:-translate-y-0.5">
        <div className="flex w-full items-start justify-between">
          <span className={`shrink-0 rounded-md p-2 ${accent ? 'bg-destructive/10 text-destructive' : 'bg-surface-alt text-primary'}`}>
            <Icon size={15} strokeWidth={2.25} />
          </span>
          <ChevronRight size={14} className="shrink-0 text-ink-mute opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
        <div className="text-xl font-extrabold leading-tight tracking-tight text-ink">{value.toLocaleString()}</div>
        <div className="text-[11px] font-semibold uppercase leading-snug tracking-wide text-ink-mute">{label}</div>
      </Card>
    </Link>
  );
}

export default async function AdminDashboardPage() {
  const stats = await getStats();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">Dashboard</h1>
        <p className="mt-1 text-sm text-ink-mute">Click any card for the full breakdown.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
        <ActiveUsersCard h1={stats.active_users_1h} h24={stats.active_users_today} d7={stats.active_users_7d} d30={stats.active_users_30d} />
        <StatCard href="/admin/users" icon={Users} label="Total users" value={stats.total_users} />
        <StatCard href="/admin/posts" icon={ImageIcon} label="Total posts" value={stats.total_posts} />
        <StatCard href="/admin/visits" icon={MapPin} label="Total visits" value={stats.total_visits} />
        <StatCard href="/admin/badges" icon={Award} label="Badges earned" value={stats.total_badges} />
        <StatCard
          href="/admin/reports"
          icon={Flag}
          label="Open reports"
          value={stats.reports_by_status.open}
          accent={stats.reports_by_status.open > 0}
        />
        <StatCard
          href="/admin/users"
          icon={UserPlus}
          label="Signups (30d)"
          value={stats.signups_by_day.reduce((sum, d) => sum + d.count, 0)}
        />
      </div>

      <Card className="border-hairline p-5 shadow-[var(--shadow-card)]">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-ink-mute">Active users — last 30 days</h2>
        <DailyActiveUsersChart data={stats.activity_by_day} />
      </Card>

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
          All actions from the last 30 days, summed into each hour of day — not a single day&apos;s timeline.
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
  );
}
