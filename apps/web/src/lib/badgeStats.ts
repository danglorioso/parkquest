import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { userBadges, customBadges } from '@/lib/db/schema';
import { getEffectiveStaticBadges } from '@/lib/badgeDefs';

export interface BadgeStatRow {
  id: string;
  name: string;
  emoji: string;
  tier: string;
  count: number;
  pct_of_active: number;
  custom: boolean;
}

export async function getBadgeStats(): Promise<{ badges: BadgeStatRow[]; active_users: number }> {
  const [counts, [{ count: activeUsers }], customRows, staticDefs] = await Promise.all([
    db.select({ badge_id: userBadges.badge_id, count: sql<number>`COUNT(*)::int` })
      .from(userBadges).groupBy(userBadges.badge_id),
    // "Active users" here = ever engaged (at least one post/visit/like/comment),
    // not a time-windowed cohort — the stable denominator for a lifetime breakdown.
    db.execute(sql`
      SELECT COUNT(DISTINCT user_id)::int AS count FROM (
        SELECT clerk_user_id AS user_id FROM posts
        UNION SELECT clerk_user_id FROM visits
        UNION SELECT user_id FROM likes
        UNION SELECT user_id FROM comments
      ) t
    `).then(r => r.rows as { count: number }[]),
    db.select().from(customBadges),
    getEffectiveStaticBadges(),
  ]);

  const countMap = new Map(counts.map(c => [c.badge_id, c.count]));
  const allDefs = [
    ...staticDefs.map(b => ({ id: b.id, name: b.name, emoji: b.emoji, tier: b.tier as string, custom: false })),
    ...customRows.map(b => ({ id: b.badge_id, name: b.name, emoji: b.emoji, tier: b.tier, custom: true })),
  ];
  const badges = allDefs
    .map(b => {
      const count = countMap.get(b.id) ?? 0;
      return {
        ...b,
        count,
        pct_of_active: activeUsers > 0 ? Math.round((count / activeUsers) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => b.count - a.count);

  return { badges, active_users: activeUsers };
}
