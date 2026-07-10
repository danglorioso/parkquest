import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { userProfiles, posts, visits, userBadges, reports } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/admin';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const [
    [{ count: totalUsers }],
    [{ count: totalPosts }],
    [{ count: totalVisits }],
    [{ count: totalBadges }],
    [{ count: activeUsersToday }],
    [{ count: activeUsers7d }],
    [{ count: activeUsers30d }],
    signupsByDay,
    activityByDay,
    reportsByStatus,
    topParks,
    hourlyActivity,
  ] = await Promise.all([
    db.select({ count: sql<number>`COUNT(*)::int` }).from(userProfiles),
    db.select({ count: sql<number>`COUNT(*)::int` }).from(posts),
    db.select({ count: sql<number>`COUNT(*)::int` }).from(visits),
    db.select({ count: sql<number>`COUNT(*)::int` }).from(userBadges),
    db.execute(sql`
      SELECT COUNT(DISTINCT user_id)::int AS count FROM (
        SELECT clerk_user_id AS user_id FROM posts WHERE created_at > NOW() - INTERVAL '1 day'
        UNION SELECT clerk_user_id FROM visits WHERE created_at > NOW() - INTERVAL '1 day'
        UNION SELECT user_id FROM likes WHERE created_at > NOW() - INTERVAL '1 day'
        UNION SELECT user_id FROM comments WHERE created_at > NOW() - INTERVAL '1 day'
      ) t
    `).then(r => r.rows as { count: number }[]),
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
    // One row per active user per day, over the trailing year — powers the
    // GitHub-style contribution heatmap. Distinct per (user, day) so a user
    // posting + commenting the same day only counts once.
    db.execute(sql`
      SELECT day, COUNT(*)::int AS count FROM (
        SELECT DISTINCT DATE(created_at) AS day, clerk_user_id AS user_id FROM posts WHERE created_at > NOW() - INTERVAL '365 days'
        UNION SELECT DISTINCT DATE(created_at), clerk_user_id FROM visits WHERE created_at > NOW() - INTERVAL '365 days'
        UNION SELECT DISTINCT DATE(created_at), user_id FROM likes WHERE created_at > NOW() - INTERVAL '365 days'
        UNION SELECT DISTINCT DATE(created_at), user_id FROM comments WHERE created_at > NOW() - INTERVAL '365 days'
      ) t
      GROUP BY day ORDER BY day
    `).then(r => r.rows as { day: string; count: number }[]),
    db.select({ status: reports.status, count: sql<number>`COUNT(*)::int` })
      .from(reports).groupBy(reports.status),
    db.execute(sql`
      SELECT p.park_code, p.name, COUNT(*)::int AS visit_count
      FROM visits v JOIN parks p ON p.park_code = v.park_code
      WHERE v.visited_date IS NOT NULL AND v.is_bucket_list = false
      GROUP BY p.park_code, p.name
      ORDER BY visit_count DESC
      LIMIT 8
    `).then(r => r.rows as { park_code: string; name: string; visit_count: number }[]),
    // Hour-of-day mix, trailing 30 days — what time of day the app gets used,
    // and by which kind of action. Each series counted independently per hour.
    db.execute(sql`
      SELECT
        hour,
        COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL)::int AS active_users,
        COUNT(*) FILTER (WHERE kind = 'post')::int AS posts,
        COUNT(*) FILTER (WHERE kind = 'like')::int AS likes,
        COUNT(*) FILTER (WHERE kind = 'comment')::int AS comments,
        COUNT(*) FILTER (WHERE kind = 'visit')::int AS visits
      FROM (
        SELECT EXTRACT(HOUR FROM created_at)::int AS hour, clerk_user_id AS user_id, 'post' AS kind FROM posts WHERE created_at > NOW() - INTERVAL '30 days'
        UNION ALL SELECT EXTRACT(HOUR FROM created_at)::int, clerk_user_id, 'visit' FROM visits WHERE created_at > NOW() - INTERVAL '30 days'
        UNION ALL SELECT EXTRACT(HOUR FROM created_at)::int, user_id, 'like' FROM likes WHERE created_at > NOW() - INTERVAL '30 days'
        UNION ALL SELECT EXTRACT(HOUR FROM created_at)::int, user_id, 'comment' FROM comments WHERE created_at > NOW() - INTERVAL '30 days'
      ) t
      GROUP BY hour ORDER BY hour
    `).then(r => r.rows as { hour: number; active_users: number; posts: number; likes: number; comments: number; visits: number }[]),
  ]);

  // Fill in any hours with zero activity so the chart always has all 24 points.
  const hourlyMap = new Map(hourlyActivity.map(h => [h.hour, h]));
  const hourlyFilled = Array.from({ length: 24 }, (_, hour) => hourlyMap.get(hour) ?? {
    hour, active_users: 0, posts: 0, likes: 0, comments: 0, visits: 0,
  });

  const reportsStatusMap = { open: 0, actioned: 0, dismissed: 0 } as Record<string, number>;
  for (const r of reportsByStatus) reportsStatusMap[r.status] = r.count;

  return NextResponse.json({
    total_users: totalUsers,
    total_posts: totalPosts,
    total_visits: totalVisits,
    total_badges: totalBadges,
    active_users_today: activeUsersToday,
    active_users_7d: activeUsers7d,
    active_users_30d: activeUsers30d,
    signups_by_day: signupsByDay,
    activity_by_day: activityByDay,
    reports_by_status: reportsStatusMap,
    top_parks: topParks,
    hourly_activity: hourlyFilled,
  });
}
