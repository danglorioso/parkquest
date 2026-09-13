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

// ── Range-scoped stats (mobile date-range picker) ─────────────────────────────
// Desktop always calls this route with no `range` param and only reads the
// fixed-window fields above, so everything below is additive — it must never
// change the shape/values of the unparented fields those callers depend on.

type RangeKey = 'today' | '7d' | '30d' | 'year';
const RANGE_DAYS: Record<Exclude<RangeKey, 'today'>, number> = { '7d': 7, '30d': 30, year: 365 };

// `col`/`range` are always internal literals (never request-derived strings
// spliced in directly) — `range` only selects which of these fixed fragments
// to use, so this is not building SQL out of user input.
function curCond(range: RangeKey, col: string): string {
  if (range === 'today') {
    return `(${col} AT TIME ZONE 'UTC' AT TIME ZONE '${ET}')::date = (NOW() AT TIME ZONE '${ET}')::date`;
  }
  return `${col} > NOW() - INTERVAL '${RANGE_DAYS[range]} days'`;
}
function prevCond(range: RangeKey, col: string): string {
  if (range === 'today') {
    return `(${col} AT TIME ZONE 'UTC' AT TIME ZONE '${ET}')::date = (NOW() AT TIME ZONE '${ET}')::date - 1`;
  }
  const days = RANGE_DAYS[range];
  return `${col} <= NOW() - INTERVAL '${days} days' AND ${col} > NOW() - INTERVAL '${days * 2} days'`;
}
function curDateCond(range: RangeKey): string {
  if (range === 'today') return `report_date = (NOW() AT TIME ZONE '${ET}')::date`;
  return `report_date > CURRENT_DATE - INTERVAL '${RANGE_DAYS[range]} days'`;
}
function prevDateCond(range: RangeKey): string {
  if (range === 'today') return `report_date = (NOW() AT TIME ZONE '${ET}')::date - 1`;
  const days = RANGE_DAYS[range];
  return `report_date <= CURRENT_DATE - INTERVAL '${days} days' AND report_date > CURRENT_DATE - INTERVAL '${days * 2} days'`;
}

function bucketDef(range: RangeKey) {
  switch (range) {
    case 'today':
      return {
        unit: 'hour', step: '1 hour', fmt: 'HH24:00',
        startExpr: `date_trunc('day', NOW() AT TIME ZONE '${ET}')`,
        endExpr: `date_trunc('day', NOW() AT TIME ZONE '${ET}') + INTERVAL '23 hours'`,
      };
    case '7d':
      return {
        unit: 'day', step: '1 day', fmt: 'YYYY-MM-DD',
        startExpr: `date_trunc('day', NOW() AT TIME ZONE '${ET}') - INTERVAL '6 days'`,
        endExpr: `date_trunc('day', NOW() AT TIME ZONE '${ET}')`,
      };
    case '30d':
      return {
        unit: 'day', step: '1 day', fmt: 'YYYY-MM-DD',
        startExpr: `date_trunc('day', NOW() AT TIME ZONE '${ET}') - INTERVAL '29 days'`,
        endExpr: `date_trunc('day', NOW() AT TIME ZONE '${ET}')`,
      };
    case 'year':
      return {
        unit: 'month', step: '1 month', fmt: 'YYYY-MM',
        startExpr: `date_trunc('month', NOW() AT TIME ZONE '${ET}') - INTERVAL '11 months'`,
        endExpr: `date_trunc('month', NOW() AT TIME ZONE '${ET}')`,
      };
  }
}

function pctDelta(cur: number, prev: number): number {
  if (prev > 0) return Math.round(((cur - prev) / prev) * 100);
  return cur > 0 ? 100 : 0;
}

async function getRangeStats(range: RangeKey) {
  const bucket = bucketDef(range);

  const [[periods], series] = await Promise.all([
    db.execute(sql`
      WITH cur AS (
        SELECT
          (SELECT COUNT(*)::int FROM user_profiles WHERE ${sql.raw(curCond(range, 'created_at'))}) AS users,
          (SELECT COUNT(*)::int FROM posts WHERE ${sql.raw(curCond(range, 'created_at'))}) AS posts,
          (SELECT COUNT(*)::int FROM visits WHERE ${sql.raw(curCond(range, 'created_at'))}) AS visits,
          (SELECT COUNT(*)::int FROM user_badges WHERE ${sql.raw(curCond(range, 'earned_at'))}) AS badges,
          (SELECT COUNT(*)::int FROM likes WHERE ${sql.raw(curCond(range, 'created_at'))}) AS likes,
          (SELECT COUNT(*)::int FROM comments WHERE ${sql.raw(curCond(range, 'created_at'))}) AS comments,
          (SELECT COUNT(*)::int FROM friendships WHERE status = 'accepted' AND ${sql.raw(curCond(range, 'updated_at'))}) AS friendships,
          (SELECT COUNT(*)::int FROM reports WHERE ${sql.raw(curCond(range, 'created_at'))}) AS reports,
          (SELECT COUNT(DISTINCT user_id)::int FROM (${ACTIVE_EVENTS}) e WHERE ${sql.raw(curCond(range, 'created_at'))}) AS active_users,
          (SELECT COALESCE(SUM(units), 0)::int FROM app_store_daily_stats WHERE ${sql.raw(curDateCond(range))}) AS app_store_units
      ),
      prev AS (
        SELECT
          (SELECT COUNT(*)::int FROM user_profiles WHERE ${sql.raw(prevCond(range, 'created_at'))}) AS users,
          (SELECT COUNT(*)::int FROM posts WHERE ${sql.raw(prevCond(range, 'created_at'))}) AS posts,
          (SELECT COUNT(*)::int FROM visits WHERE ${sql.raw(prevCond(range, 'created_at'))}) AS visits,
          (SELECT COUNT(*)::int FROM user_badges WHERE ${sql.raw(prevCond(range, 'earned_at'))}) AS badges,
          (SELECT COUNT(*)::int FROM likes WHERE ${sql.raw(prevCond(range, 'created_at'))}) AS likes,
          (SELECT COUNT(*)::int FROM comments WHERE ${sql.raw(prevCond(range, 'created_at'))}) AS comments,
          (SELECT COUNT(*)::int FROM friendships WHERE status = 'accepted' AND ${sql.raw(prevCond(range, 'updated_at'))}) AS friendships,
          (SELECT COUNT(*)::int FROM reports WHERE ${sql.raw(prevCond(range, 'created_at'))}) AS reports,
          (SELECT COUNT(DISTINCT user_id)::int FROM (${ACTIVE_EVENTS}) e WHERE ${sql.raw(prevCond(range, 'created_at'))}) AS active_users,
          (SELECT COALESCE(SUM(units), 0)::int FROM app_store_daily_stats WHERE ${sql.raw(prevDateCond(range))}) AS app_store_units
      )
      SELECT
        cur.users, cur.posts, cur.visits, cur.badges, cur.likes, cur.comments,
        cur.friendships, cur.reports, cur.active_users, cur.app_store_units,
        prev.users AS prev_users, prev.posts AS prev_posts, prev.visits AS prev_visits,
        prev.badges AS prev_badges, prev.likes AS prev_likes, prev.comments AS prev_comments,
        prev.friendships AS prev_friendships, prev.reports AS prev_reports,
        prev.active_users AS prev_active_users, prev.app_store_units AS prev_app_store_units
      FROM cur, prev
    `).then(r => r.rows as {
      users: number; posts: number; visits: number; badges: number; likes: number; comments: number;
      friendships: number; reports: number; active_users: number; app_store_units: number;
      prev_users: number; prev_posts: number; prev_visits: number; prev_badges: number; prev_likes: number;
      prev_comments: number; prev_friendships: number; prev_reports: number; prev_active_users: number;
      prev_app_store_units: number;
    }[]),
    db.execute(sql`
      WITH buckets AS (
        SELECT generate_series(${sql.raw(bucket.startExpr)}, ${sql.raw(bucket.endExpr)}, INTERVAL '${sql.raw(bucket.step)}') AS bucket
      ),
      signups AS (
        SELECT date_trunc('${sql.raw(bucket.unit)}', created_at AT TIME ZONE 'UTC' AT TIME ZONE '${sql.raw(ET)}') AS bucket, COUNT(*)::int AS count
        FROM user_profiles
        WHERE ${sql.raw(curCond(range, 'created_at'))}
        GROUP BY 1
      ),
      active AS (
        SELECT date_trunc('${sql.raw(bucket.unit)}', created_at AT TIME ZONE 'UTC' AT TIME ZONE '${sql.raw(ET)}') AS bucket, COUNT(DISTINCT user_id)::int AS count
        FROM (${ACTIVE_EVENTS}) e
        WHERE ${sql.raw(curCond(range, 'created_at'))}
        GROUP BY 1
      ),
      appstore AS (
        SELECT date_trunc('${sql.raw(bucket.unit)}', report_date::timestamp) AS bucket, SUM(units)::int AS units
        FROM app_store_daily_stats
        WHERE ${sql.raw(curDateCond(range))}
        GROUP BY 1
      )
      SELECT to_char(b.bucket, '${sql.raw(bucket.fmt)}') AS bucket,
             COALESCE(s.count, 0)::int AS signups,
             COALESCE(a.count, 0)::int AS active_users,
             aps.units AS app_store_units
      FROM buckets b
      LEFT JOIN signups s ON s.bucket = b.bucket
      LEFT JOIN active a ON a.bucket = b.bucket
      LEFT JOIN appstore aps ON aps.bucket = b.bucket
      ORDER BY b.bucket
    `).then(r => r.rows as { bucket: string; signups: number; active_users: number; app_store_units: number | null }[]),
  ]);

  return {
    range,
    range_totals: {
      users: periods.users, posts: periods.posts, visits: periods.visits, badges: periods.badges,
      likes: periods.likes, comments: periods.comments, friendships: periods.friendships,
      reports: periods.reports, active_users: periods.active_users, app_store_units: periods.app_store_units,
    },
    range_deltas: {
      users: pctDelta(periods.users, periods.prev_users),
      posts: pctDelta(periods.posts, periods.prev_posts),
      visits: pctDelta(periods.visits, periods.prev_visits),
      badges: pctDelta(periods.badges, periods.prev_badges),
      likes: pctDelta(periods.likes, periods.prev_likes),
      comments: pctDelta(periods.comments, periods.prev_comments),
      friendships: pctDelta(periods.friendships, periods.prev_friendships),
      reports: pctDelta(periods.reports, periods.prev_reports),
      active_users: pctDelta(periods.active_users, periods.prev_active_users),
      app_store_units: pctDelta(periods.app_store_units, periods.prev_app_store_units),
    },
    range_series: series,
  };
}

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const rangeParam = new URL(request.url).searchParams.get('range');
  const range: RangeKey = (['today', '7d', '30d', 'year'] as const).includes(rangeParam as RangeKey)
    ? (rangeParam as RangeKey)
    : '7d';

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
    appStoreDevices,
    [deltas24h],
    rangeStats,
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
    // Day keys are zero-filled (via generate_series) so the bars line up 1:1
    // with the DAU chart beside it, but the metric VALUES are left NULL, not
    // zero-filled — a day Apple hasn't published yet (row absent, or present
    // with a null analytics column, see the schema comment on
    // app_store_daily_stats) must stay NULL through to the client so the
    // chart can leave it blank instead of drawing a fake zero bar. Apple
    // publishes 24-48h behind, so the last day or two are always NULL, not 0.
    db.execute(sql`
      WITH days AS (
        SELECT generate_series(
          (NOW() AT TIME ZONE '${sql.raw(ET)}')::date - 29,
          (NOW() AT TIME ZONE '${sql.raw(ET)}')::date,
          INTERVAL '1 day'
        )::date AS day
      )
      SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
             s.units::int AS units,
             s.proceeds::float AS proceeds,
             s.impressions::int AS impressions,
             s.product_page_views::int AS page_views,
             s.first_time_downloads::int AS first_time_downloads,
             s.redownloads::int AS redownloads,
             -- Apple's definition: total downloads ÷ unique impressions.
             CASE WHEN COALESCE(s.impressions_unique, 0) > 0
               THEN ROUND(100.0 * (COALESCE(s.first_time_downloads, 0) + COALESCE(s.redownloads, 0))
                          / s.impressions_unique, 1)::float
               ELSE NULL END AS conversion
      FROM days d LEFT JOIN app_store_daily_stats s ON s.report_date = d.day
      ORDER BY d.day
    `).then(r => r.rows as {
      day: string; units: number | null; proceeds: number | null; impressions: number | null;
      page_views: number | null; first_time_downloads: number | null; redownloads: number | null; conversion: number | null;
    }[]),
    db.execute(sql`
      SELECT COALESCE(SUM(units), 0)::int AS units, COALESCE(SUM(proceeds), 0)::float AS proceeds,
             COALESCE(SUM(impressions), 0)::int AS impressions,
             COALESCE(SUM(product_page_views), 0)::int AS page_views,
             COALESCE(SUM(first_time_downloads), 0)::int AS first_time_downloads,
             COALESCE(SUM(redownloads), 0)::int AS redownloads,
             CASE WHEN COALESCE(SUM(impressions_unique), 0) > 0
               THEN ROUND(100.0 * SUM(COALESCE(first_time_downloads, 0) + COALESCE(redownloads, 0))
                          / SUM(impressions_unique), 1)::float
               ELSE NULL END AS conversion
      FROM app_store_daily_stats
      WHERE report_date > CURRENT_DATE - INTERVAL '30 days'
    `).then(r => r.rows as {
      units: number; proceeds: number; impressions: number; page_views: number;
      first_time_downloads: number; redownloads: number; conversion: number | null;
    }[]),
    db.execute(sql`
      SELECT device, SUM(first_time_downloads + redownloads)::int AS downloads
      FROM app_store_device_downloads
      WHERE report_date > CURRENT_DATE - INTERVAL '30 days'
      GROUP BY device
      HAVING SUM(first_time_downloads + redownloads) > 0
      ORDER BY downloads DESC
    `).then(r => r.rows as { device: string; downloads: number }[]),
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
    getRangeStats(range),
  ]);

  const reportsStatusMap = { open: 0, actioned: 0, dismissed: 0 } as Record<string, number>;
  for (const r of reportsByStatus) reportsStatusMap[r.status] = r.count;

  return NextResponse.json({
    ...rangeStats,
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
    app_store_impressions_30d: appStoreTotals.impressions,
    app_store_page_views_30d: appStoreTotals.page_views,
    app_store_first_time_downloads_30d: appStoreTotals.first_time_downloads,
    app_store_redownloads_30d: appStoreTotals.redownloads,
    app_store_conversion_30d: appStoreTotals.conversion,
    app_store_devices_30d: appStoreDevices,
    deltas_24h: deltas24h,
  });
}
