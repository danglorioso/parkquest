import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { userProfiles, posts, visits, userBadges, reports } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/admin';

// All day/hour bucketing is done in America/New_York, not UTC — an
// hour-of-day chart or "today" boundary in UTC is off by 4-5 hours and reads
// as nonsense. Timestamps are stored naive-UTC (defaultNow()), hence the
// double AT TIME ZONE hop.
const ET = `America/New_York`;

// One shared definition of "active": any write action OR a presence touch
// (user_activity_days, recorded by touchActivity() on authed reads). Before
// presence rows existed this undercounted badly — browse-only sessions were
// invisible, which is why the dashboard once showed 1 active user on a day
// with 5 real ones. Series/window queries all draw from this same union so
// every number on the dashboard agrees about what "active" means.
const ACTIVE_EVENTS = sql.raw(`
  SELECT clerk_user_id AS user_id, created_at FROM posts
  UNION ALL SELECT clerk_user_id, created_at FROM visits
  UNION ALL SELECT user_id, created_at FROM likes
  UNION ALL SELECT user_id, created_at FROM comments
  UNION ALL SELECT requester_id, created_at FROM friendships
  UNION ALL SELECT reporter_id, created_at FROM reports
  UNION ALL SELECT blocker_id, created_at FROM blocks
  UNION ALL SELECT clerk_user_id, last_seen_at FROM user_activity_days
`);

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const [
    [totals],
    [activeWindows],
    signupsByDay,
    dau30,
    heatmapByDay,
    hourlyActivity,
    reportsByStatus,
    topParks,
    appStoreByDay,
    [appStoreTotals],
    [deltas24h],
  ] = await Promise.all([
    db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM user_profiles)  AS total_users,
        (SELECT COUNT(*)::int FROM posts)          AS total_posts,
        (SELECT COUNT(*)::int FROM visits)         AS total_visits,
        (SELECT COUNT(*)::int FROM user_badges)    AS total_badges,
        (SELECT COUNT(*)::int FROM likes)          AS total_likes,
        (SELECT COUNT(*)::int FROM comments)       AS total_comments,
        (SELECT COUNT(*)::int FROM friendships WHERE status = 'accepted') AS total_friendships
    `).then(r => r.rows as {
      total_users: number; total_posts: number; total_visits: number;
      total_badges: number; total_likes: number; total_comments: number; total_friendships: number;
    }[]),
    db.execute(sql`
      SELECT
        COUNT(DISTINCT user_id) FILTER (WHERE created_at > NOW() - INTERVAL '15 minutes')::int AS m15,
        COUNT(DISTINCT user_id) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour')::int    AS h1,
        COUNT(DISTINCT user_id) FILTER (WHERE created_at > NOW() - INTERVAL '1 day')::int     AS h24,
        COUNT(DISTINCT user_id) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int    AS d7,
        COUNT(DISTINCT user_id) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::int   AS d30
      FROM (${ACTIVE_EVENTS}) e
      WHERE created_at > NOW() - INTERVAL '30 days'
    `).then(r => r.rows as { m15: number; h1: number; h24: number; d7: number; d30: number }[]),
    // Signups, zero-filled over the trailing 30 ET days in SQL — the client
    // renders exactly what it gets, no key-matching (the class of bug where
    // the neon driver's DATE-as-ISO-timestamp broke every Map lookup).
    db.execute(sql`
      WITH days AS (
        SELECT generate_series(
          (NOW() AT TIME ZONE '${sql.raw(ET)}')::date - 29,
          (NOW() AT TIME ZONE '${sql.raw(ET)}')::date,
          INTERVAL '1 day'
        )::date AS day
      ),
      per_day AS (
        SELECT (created_at AT TIME ZONE 'UTC' AT TIME ZONE '${sql.raw(ET)}')::date AS day, COUNT(*)::int AS count
        FROM user_profiles
        WHERE created_at > NOW() - INTERVAL '32 days'
        GROUP BY 1
      )
      SELECT to_char(d.day, 'YYYY-MM-DD') AS day, COALESCE(p.count, 0)::int AS count
      FROM days d LEFT JOIN per_day p ON p.day = d.day
      ORDER BY d.day
    `).then(r => r.rows as { day: string; count: number }[]),
    // Daily active users, zero-filled trailing 30 ET days.
    db.execute(sql`
      WITH days AS (
        SELECT generate_series(
          (NOW() AT TIME ZONE '${sql.raw(ET)}')::date - 29,
          (NOW() AT TIME ZONE '${sql.raw(ET)}')::date,
          INTERVAL '1 day'
        )::date AS day
      ),
      per_day AS (
        SELECT (created_at AT TIME ZONE 'UTC' AT TIME ZONE '${sql.raw(ET)}')::date AS day,
               COUNT(DISTINCT user_id)::int AS count
        FROM (${ACTIVE_EVENTS}) e
        WHERE created_at > NOW() - INTERVAL '32 days'
        GROUP BY 1
      )
      SELECT to_char(d.day, 'YYYY-MM-DD') AS day, COALESCE(p.count, 0)::int AS count
      FROM days d LEFT JOIN per_day p ON p.day = d.day
      ORDER BY d.day
    `).then(r => r.rows as { day: string; count: number }[]),
    // Trailing year, sparse (heatmap zero-fills its own grid client-side —
    // 365 zero rows over the wire buy nothing).
    db.execute(sql`
      SELECT day, COUNT(*)::int AS count FROM (
        SELECT DISTINCT to_char((created_at AT TIME ZONE 'UTC' AT TIME ZONE '${sql.raw(ET)}')::date, 'YYYY-MM-DD') AS day, user_id
        FROM (${ACTIVE_EVENTS}) e
        WHERE created_at > NOW() - INTERVAL '365 days'
      ) t
      GROUP BY day ORDER BY day
    `).then(r => r.rows as { day: string; count: number }[]),
    // Hour-of-day mix (ET), trailing 30 days, all 24 hours zero-filled.
    db.execute(sql`
      WITH hours AS (SELECT generate_series(0, 23)::int AS hour),
      events AS (
        SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC' AT TIME ZONE '${sql.raw(ET)}')::int AS hour,
               user_id, kind
        FROM (
          SELECT clerk_user_id AS user_id, created_at, 'post' AS kind FROM posts WHERE created_at > NOW() - INTERVAL '30 days'
          UNION ALL SELECT clerk_user_id, created_at, 'visit' FROM visits WHERE created_at > NOW() - INTERVAL '30 days'
          UNION ALL SELECT user_id, created_at, 'like' FROM likes WHERE created_at > NOW() - INTERVAL '30 days'
          UNION ALL SELECT user_id, created_at, 'comment' FROM comments WHERE created_at > NOW() - INTERVAL '30 days'
        ) t
      )
      SELECT
        h.hour,
        COUNT(DISTINCT e.user_id)::int                       AS active_users,
        COUNT(*) FILTER (WHERE e.kind = 'post')::int         AS posts,
        COUNT(*) FILTER (WHERE e.kind = 'like')::int         AS likes,
        COUNT(*) FILTER (WHERE e.kind = 'comment')::int      AS comments,
        COUNT(*) FILTER (WHERE e.kind = 'visit')::int        AS visits
      FROM hours h LEFT JOIN events e ON e.hour = h.hour
      GROUP BY h.hour ORDER BY h.hour
    `).then(r => r.rows as { hour: number; active_users: number; posts: number; likes: number; comments: number; visits: number }[]),
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
    // Zero-filled like the other 30-day series so the bars line up 1:1 with
    // the DAU chart beside it (two sparse rows rendered as two half-width
    // mega-bars otherwise). A zero here means "no report yet" as well as
    // "zero sales" — Apple publishes 24-48h behind, so the last day or two
    // are always zero.
    db.execute(sql`
      WITH days AS (
        SELECT generate_series(
          (NOW() AT TIME ZONE '${sql.raw(ET)}')::date - 29,
          (NOW() AT TIME ZONE '${sql.raw(ET)}')::date,
          INTERVAL '1 day'
        )::date AS day
      )
      SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
             COALESCE(s.units, 0)::int AS units,
             COALESCE(s.proceeds, 0)::float AS proceeds
      FROM days d LEFT JOIN app_store_daily_stats s ON s.report_date = d.day
      ORDER BY d.day
    `).then(r => r.rows as { day: string; units: number; proceeds: number }[]),
    db.execute(sql`
      SELECT COALESCE(SUM(units), 0)::int AS units, COALESCE(SUM(proceeds), 0)::float AS proceeds
      FROM app_store_daily_stats
      WHERE report_date > CURRENT_DATE - INTERVAL '30 days'
    `).then(r => r.rows as { units: number; proceeds: number }[]),
    // 24h additions for the stat tiles' +N badges. Additions only — hard
    // deletes (removed posts, unfriends) aren't tracked, so this is "new in
    // the last day", not strict net change.
    db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM user_profiles WHERE created_at > NOW() - INTERVAL '1 day') AS users,
        (SELECT COUNT(*)::int FROM posts WHERE created_at > NOW() - INTERVAL '1 day')         AS posts,
        (SELECT COUNT(*)::int FROM visits WHERE created_at > NOW() - INTERVAL '1 day')        AS visits,
        (SELECT COUNT(*)::int FROM user_badges WHERE earned_at > NOW() - INTERVAL '1 day')    AS badges,
        (SELECT COUNT(*)::int FROM likes WHERE created_at > NOW() - INTERVAL '1 day')         AS likes,
        (SELECT COUNT(*)::int FROM comments WHERE created_at > NOW() - INTERVAL '1 day')      AS comments,
        (SELECT COUNT(*)::int FROM friendships WHERE status = 'accepted' AND updated_at > NOW() - INTERVAL '1 day') AS friendships,
        (SELECT COUNT(*)::int FROM reports WHERE created_at > NOW() - INTERVAL '1 day')       AS reports
    `).then(r => r.rows as {
      users: number; posts: number; visits: number;
      badges: number; likes: number; comments: number; friendships: number; reports: number;
    }[]),
  ]);

  const reportsStatusMap = { open: 0, actioned: 0, dismissed: 0 } as Record<string, number>;
  for (const r of reportsByStatus) reportsStatusMap[r.status] = r.count;

  return NextResponse.json({
    total_users: totals.total_users,
    total_posts: totals.total_posts,
    total_visits: totals.total_visits,
    total_badges: totals.total_badges,
    total_likes: totals.total_likes,
    total_comments: totals.total_comments,
    total_friendships: totals.total_friendships,
    active_users_15m: activeWindows.m15,
    active_users_1h: activeWindows.h1,
    active_users_today: activeWindows.h24,
    active_users_7d: activeWindows.d7,
    active_users_30d: activeWindows.d30,
    signups_by_day: signupsByDay,
    dau_30d: dau30,
    activity_by_day: heatmapByDay,
    reports_by_status: reportsStatusMap,
    top_parks: topParks,
    hourly_activity: hourlyActivity,
    app_store_by_day: appStoreByDay,
    app_store_units_30d: appStoreTotals.units,
    app_store_proceeds_30d: appStoreTotals.proceeds,
    deltas_24h: deltas24h,
  });
}
