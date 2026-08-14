import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { userBadges, customBadges, userProfiles } from '@/lib/db/schema';

export interface BadgeStatRow {
  id: string;
  name: string;
  emoji: string;
  tier: string;
  count: number;
  pct_of_users: number;
}

export async function getBadgeStats(): Promise<{ badges: BadgeStatRow[]; total_users: number }> {
  const [counts, [{ count: totalUsers }], badgeRows] = await Promise.all([
    db.select({ badge_id: userBadges.badge_id, count: sql<number>`COUNT(*)::int` })
      .from(userBadges).groupBy(userBadges.badge_id),
    db.select({ count: sql<number>`COUNT(*)::int` }).from(userProfiles),
    db.select().from(customBadges),
  ]);

  const countMap = new Map(counts.map(c => [c.badge_id, c.count]));
  const badges = badgeRows
    .map(b => {
      const count = countMap.get(b.badge_id) ?? 0;
      return {
        id: b.badge_id,
        name: b.name,
        emoji: b.emoji,
        tier: b.tier,
        count,
        pct_of_users: totalUsers > 0 ? Math.round((count / totalUsers) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => b.count - a.count);

  return { badges, total_users: totalUsers };
}
