import { headers } from 'next/headers';

interface Stats {
  total_users: number;
  total_posts: number;
  total_visits: number;
  total_badges: number;
  active_users_7d: number;
  active_users_30d: number;
  signups_by_day: { day: string; count: number }[];
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

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ border: '1px solid #e5e5e5', borderRadius: 10, padding: 16, minWidth: 140 }}>
      <div style={{ fontSize: 13, color: '#888', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700 }}>{value.toLocaleString()}</div>
    </div>
  );
}

export default async function AdminDashboardPage() {
  const stats = await getStats();

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>Dashboard</h1>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 32 }}>
        <StatCard label="Total users" value={stats.total_users} />
        <StatCard label="Total posts" value={stats.total_posts} />
        <StatCard label="Total visits" value={stats.total_visits} />
        <StatCard label="Badges earned" value={stats.total_badges} />
        <StatCard label="Active users (7d)" value={stats.active_users_7d} />
        <StatCard label="Active users (30d)" value={stats.active_users_30d} />
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Signups — last 30 days</h2>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 120, border: '1px solid #e5e5e5', borderRadius: 10, padding: 12 }}>
        {stats.signups_by_day.length === 0 ? (
          <span style={{ fontSize: 13, color: '#888' }}>No signups in this window.</span>
        ) : (
          (() => {
            const max = Math.max(...stats.signups_by_day.map(d => d.count), 1);
            return stats.signups_by_day.map(d => (
              <div key={d.day} title={`${d.day}: ${d.count}`} style={{ flex: 1, display: 'flex', alignItems: 'flex-end' }}>
                <div style={{ width: '100%', height: `${(d.count / max) * 100}%`, minHeight: 2, background: '#333', borderRadius: 2 }} />
              </div>
            ));
          })()
        )}
      </div>
    </div>
  );
}
