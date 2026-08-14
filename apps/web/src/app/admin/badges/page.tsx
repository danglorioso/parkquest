import { CollapsibleCard } from '../CollapsibleCard';
import BadgeManager from './BadgeManager';
import { getBadgeStats } from '@/lib/badgeStats';

export default async function AdminBadgesPage() {
  // Admin access is already gated by the parent /admin layout — query
  // directly instead of self-fetching our own API route (SSR self-fetch is
  // fragile: it round-trips through the network for data we already have
  // in-process, and cookie/auth forwarding across that hop isn't reliable).
  const { badges, total_users: totalUsers } = await getBadgeStats();
  const totalEarned = badges.reduce((sum, b) => sum + b.count, 0);
  const max = Math.max(...badges.map(b => b.count), 1);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">Badges</h1>
        <p className="mt-1 text-sm text-ink-mute">
          {totalEarned.toLocaleString()} badges earned across {badges.length} types.
          Percentages are of all {totalUsers.toLocaleString()} users on the platform.
        </p>
      </div>

      <BadgeManager />

      <CollapsibleCard title="Earn rates">
        <div className="flex flex-col gap-3">
          {badges.map(b => (
            <div key={b.id} className="flex items-center gap-3">
              <span className="w-7 shrink-0 text-lg leading-none">{b.emoji}</span>
              <span className="w-40 shrink-0 truncate text-sm font-medium text-ink-soft">{b.name}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-alt">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(b.count / max) * 100}%` }} />
              </div>
              <span className="w-24 shrink-0 text-right text-sm text-ink-soft">{b.pct_of_users}% of users</span>
              <span className="w-10 shrink-0 text-right text-sm font-semibold text-ink">{b.count}</span>
            </div>
          ))}
        </div>
      </CollapsibleCard>
    </div>
  );
}
