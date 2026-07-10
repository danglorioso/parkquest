import Link from 'next/link';
import { headers } from 'next/headers';
import { Users, Image as ImageIcon, MapPin, Award, Activity, TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { SignupsChart, ContributionHeatmap, ReportsStatusBar, TopParksList } from './AdminCharts';

interface Stats {
  total_users: number;
  total_posts: number;
  total_visits: number;
  total_badges: number;
  active_users_7d: number;
  active_users_30d: number;
  signups_by_day: { day: string; count: number }[];
  activity_by_day: { day: string; count: number }[];
  reports_by_status: { open: number; actioned: number; dismissed: number };
  top_parks: { park_code: string; name: string; visit_count: number }[];
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
  href, icon: Icon, label, value,
}: { href: string; icon: React.ElementType; label: string; value: number }) {
  return (
    <Link href={href}>
      <Card className="group cursor-pointer gap-2 border-hairline p-4 shadow-[var(--shadow-card)] transition-transform hover:-translate-y-0.5">
        <div className="flex items-center justify-between">
          <span className="rounded-md bg-surface-alt p-1.5 text-primary">
            <Icon size={16} strokeWidth={2.25} />
          </span>
          <TrendingUp size={13} className="text-ink-mute opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
        <div className="text-2xl font-extrabold tracking-tight text-ink">{value.toLocaleString()}</div>
        <div className="text-xs font-semibold uppercase tracking-wide text-ink-mute">{label}</div>
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
        <StatCard href="/admin/users" icon={Users} label="Total users" value={stats.total_users} />
        <StatCard href="/admin/posts" icon={ImageIcon} label="Total posts" value={stats.total_posts} />
        <StatCard href="/admin/visits" icon={MapPin} label="Total visits" value={stats.total_visits} />
        <StatCard href="/admin/badges" icon={Award} label="Badges earned" value={stats.total_badges} />
        <StatCard href="/admin/users?active=7" icon={Activity} label="Active (7d)" value={stats.active_users_7d} />
        <StatCard href="/admin/users?active=30" icon={Activity} label="Active (30d)" value={stats.active_users_30d} />
      </div>

      <Card className="border-hairline p-5 shadow-[var(--shadow-card)]">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-ink-mute">Activity — last 12 months</h2>
        <ContributionHeatmap data={stats.activity_by_day} />
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
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-ink-mute">Top parks by visits</h2>
        <TopParksList parks={stats.top_parks} />
      </Card>
    </div>
  );
}
