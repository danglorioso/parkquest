import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';

const SORT_COLUMNS = ['visit_count', 'post_count', 'avg_rank_score', 'avg_crowd', 'avg_difficulty', 'pct_would_return', 'name'] as const;
type SortColumn = (typeof SORT_COLUMNS)[number];

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const sortParam = searchParams.get('sort');
  const sort: SortColumn = (SORT_COLUMNS as readonly string[]).includes(sortParam ?? '')
    ? (sortParam as SortColumn)
    : 'visit_count';
  const dir = searchParams.get('dir') === 'asc' ? sql`ASC` : sql`DESC`;

  const orderColumn = sql.raw(sort);

  // Each visit's 0-10 score is derived from its position in that user's own
  // rank_key order (favorite = 10), not stored — see packages/types/rankScore.ts
  // for the same curve computed client-side. This is the one place that needs
  // it in raw SQL, since it averages across users rather than sorting one
  // user's own list.
  const rows = await db.execute(sql`
    WITH scored AS (
      SELECT
        id, park_code,
        10.0 * POWER(
          1.0 - (ROW_NUMBER() OVER (PARTITION BY clerk_user_id ORDER BY rank_key) - 1)
                / GREATEST(COUNT(*) OVER (PARTITION BY clerk_user_id) - 1, 1),
          0.7
        ) AS rank_score
      FROM visits
      WHERE rank_key IS NOT NULL AND visited_date IS NOT NULL AND is_bucket_list = false
    )
    SELECT
      p.park_code, p.name, p.states, p.stamp_glyph,
      COUNT(v.id)::int AS visit_count,
      COUNT(DISTINCT po.id)::int AS post_count,
      ROUND(AVG(s.rank_score)::numeric, 2) AS avg_rank_score,
      ROUND(AVG(v.crowd)::numeric, 2) AS avg_crowd,
      ROUND(AVG(v.difficulty)::numeric, 2) AS avg_difficulty,
      ROUND(100.0 * COUNT(*) FILTER (WHERE v.would_return = 'yes') / NULLIF(COUNT(v.would_return), 0), 1) AS pct_would_return
    FROM parks p
    LEFT JOIN visits v ON v.park_code = p.park_code AND v.visited_date IS NOT NULL AND v.is_bucket_list = false
    LEFT JOIN scored s ON s.id = v.id
    LEFT JOIN posts po ON po.park_code = p.park_code
    GROUP BY p.park_code, p.name, p.states, p.stamp_glyph
    ORDER BY ${orderColumn} ${dir} NULLS LAST
    LIMIT 500
  `);

  return NextResponse.json({ parks: rows.rows, sort, dir: searchParams.get('dir') === 'asc' ? 'asc' : 'desc' });
}
