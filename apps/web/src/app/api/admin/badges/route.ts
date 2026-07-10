import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { userBadges } from '@/lib/db/schema';
import { ALL_BADGES } from '@/lib/badges';
import { requireAdmin } from '@/lib/admin';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const [counts, [{ count: activeUsers }]] = await Promise.all([
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
  ]);

  const countMap = new Map(counts.map(c => [c.badge_id, c.count]));
  const badges = ALL_BADGES
    .map(b => {
      const count = countMap.get(b.id) ?? 0;
      return {
        id: b.id,
        name: b.name,
        emoji: b.emoji,
        tier: b.tier,
        count,
        pct_of_active: activeUsers > 0 ? Math.round((count / activeUsers) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({ badges, active_users: activeUsers });
}
