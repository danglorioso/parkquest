import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { userBadges } from '@/lib/db/schema';
import { ALL_BADGES } from '@/lib/badges';
import { Card } from '@/components/ui/card';

export default async function AdminBadgesPage() {
  const counts = await db
    .select({ badge_id: userBadges.badge_id, count: sql<number>`COUNT(*)::int` })
    .from(userBadges)
    .groupBy(userBadges.badge_id);

  const countMap = new Map(counts.map(c => [c.badge_id, c.count]));
  const rows = ALL_BADGES
    .map(b => ({ ...b, count: countMap.get(b.id) ?? 0 }))
    .sort((a, b) => b.count - a.count);
  const max = Math.max(...rows.map(r => r.count), 1);
  const totalEarned = counts.reduce((sum, c) => sum + c.count, 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">Badges</h1>
        <p className="mt-1 text-sm text-ink-mute">{totalEarned.toLocaleString()} badges earned across {rows.length} types.</p>
      </div>

      <Card className="border-hairline p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-col gap-3">
          {rows.map(b => (
            <div key={b.id} className="flex items-center gap-3">
              <span className="w-7 shrink-0 text-lg leading-none">{b.emoji}</span>
              <span className="w-40 shrink-0 truncate text-sm font-medium text-ink-soft">{b.name}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-alt">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(b.count / max) * 100}%` }} />
              </div>
              <span className="w-10 shrink-0 text-right text-sm font-semibold text-ink">{b.count}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
