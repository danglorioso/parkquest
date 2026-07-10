import { headers } from 'next/headers';
import { Card } from '@/components/ui/card';

interface BadgeRow {
  id: string;
  name: string;
  emoji: string;
  tier: string;
  count: number;
  pct_of_active: number;
}

async function getBadges() {
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('host');
  const res = await fetch(`${proto}://${host}/api/admin/badges`, {
    headers: { cookie: h.get('cookie') ?? '' },
    cache: 'no-store',
  });
  return res.json() as Promise<{ badges: BadgeRow[]; active_users: number }>;
}

export default async function AdminBadgesPage() {
  const { badges, active_users: activeUsers } = await getBadges();
  const totalEarned = badges.reduce((sum, b) => sum + b.count, 0);
  const max = Math.max(...badges.map(b => b.count), 1);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">Badges</h1>
        <p className="mt-1 text-sm text-ink-mute">
          {totalEarned.toLocaleString()} badges earned across {badges.length} types.
          Percentages are of the {activeUsers.toLocaleString()} users who have ever posted or logged a visit.
        </p>
      </div>

      <Card className="border-hairline p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-col gap-3">
          {badges.map(b => (
            <div key={b.id} className="flex items-center gap-3">
              <span className="w-7 shrink-0 text-lg leading-none">{b.emoji}</span>
              <span className="w-40 shrink-0 truncate text-sm font-medium text-ink-soft">{b.name}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-alt">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(b.count / max) * 100}%` }} />
              </div>
              <span className="w-24 shrink-0 text-right text-sm text-ink-soft">{b.pct_of_active}% active</span>
              <span className="w-10 shrink-0 text-right text-sm font-semibold text-ink">{b.count}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
