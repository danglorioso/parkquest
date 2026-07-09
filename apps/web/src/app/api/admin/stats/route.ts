import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { userProfiles, posts, visits, userBadges } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/admin';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const [
    [{ count: totalUsers }],
    [{ count: totalPosts }],
    [{ count: totalVisits }],
    [{ count: totalBadges }],
    [{ count: activeUsers7d }],
    [{ count: activeUsers30d }],
    signupsByDay,
  ] = await Promise.all([
    db.select({ count: sql<number>`COUNT(*)::int` }).from(userProfiles),
    db.select({ count: sql<number>`COUNT(*)::int` }).from(posts),
    db.select({ count: sql<number>`COUNT(*)::int` }).from(visits),
    db.select({ count: sql<number>`COUNT(*)::int` }).from(userBadges),
    db.execute(sql`
      SELECT COUNT(DISTINCT user_id)::int AS count FROM (
        SELECT clerk_user_id AS user_id FROM posts WHERE created_at > NOW() - INTERVAL '7 days'
        UNION SELECT clerk_user_id FROM visits WHERE created_at > NOW() - INTERVAL '7 days'
        UNION SELECT user_id FROM likes WHERE created_at > NOW() - INTERVAL '7 days'
        UNION SELECT user_id FROM comments WHERE created_at > NOW() - INTERVAL '7 days'
      ) t
    `).then(r => r.rows as { count: number }[]),
    db.execute(sql`
      SELECT COUNT(DISTINCT user_id)::int AS count FROM (
        SELECT clerk_user_id AS user_id FROM posts WHERE created_at > NOW() - INTERVAL '30 days'
        UNION SELECT clerk_user_id FROM visits WHERE created_at > NOW() - INTERVAL '30 days'
        UNION SELECT user_id FROM likes WHERE created_at > NOW() - INTERVAL '30 days'
        UNION SELECT user_id FROM comments WHERE created_at > NOW() - INTERVAL '30 days'
      ) t
    `).then(r => r.rows as { count: number }[]),
    db.execute(sql`
      SELECT DATE(created_at) AS day, COUNT(*)::int AS count
      FROM user_profiles
      WHERE created_at > NOW() - INTERVAL '30 days'
      GROUP BY day ORDER BY day
    `).then(r => r.rows as { day: string; count: number }[]),
  ]);

  return NextResponse.json({
    total_users: totalUsers,
    total_posts: totalPosts,
    total_visits: totalVisits,
    total_badges: totalBadges,
    active_users_7d: activeUsers7d,
    active_users_30d: activeUsers30d,
    signups_by_day: signupsByDay,
  });
}
