import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { isNotNull, sql, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { posts, parks } from '@/lib/db/schema';

const LIMIT = 5;

export async function GET() {
  try {
    await auth();

    // Parks with the most posts in the last 7 days
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const thisWeek = await db
      .select({
        park_code: posts.park_code,
        park_name: parks.name,
        post_count: sql<number>`COUNT(*)::int`,
        period: sql<string>`'week'`,
      })
      .from(posts)
      .leftJoin(parks, sql`${posts.park_code} = ${parks.park_code}`)
      .where(sql`${posts.park_code} IS NOT NULL AND ${posts.created_at} >= ${weekAgo}`)
      .groupBy(posts.park_code, parks.name)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(LIMIT);

    if (thisWeek.length >= 3) {
      return NextResponse.json(thisWeek);
    }

    // Fallback: all-time leaderboard
    const allTime = await db
      .select({
        park_code: posts.park_code,
        park_name: parks.name,
        post_count: sql<number>`COUNT(*)::int`,
        period: sql<string>`'all_time'`,
      })
      .from(posts)
      .leftJoin(parks, sql`${posts.park_code} = ${parks.park_code}`)
      .where(isNotNull(posts.park_code))
      .groupBy(posts.park_code, parks.name)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(LIMIT);

    if (allTime.length > 0) {
      return NextResponse.json(allTime);
    }

    // Last resort: most-visited parks from the visits table
    const mostVisited = await db.execute(sql`
      SELECT
        v.park_code,
        p.name AS park_name,
        COUNT(*)::int AS post_count,
        'popular' AS period
      FROM visits v
      LEFT JOIN parks p ON v.park_code = p.park_code
      WHERE v.park_code IS NOT NULL
        AND v.visited_date IS NOT NULL
        AND v.is_bucket_list = false
      GROUP BY v.park_code, p.name
      ORDER BY COUNT(*) DESC
      LIMIT ${LIMIT}
    `);

    return NextResponse.json(mostVisited.rows);
  } catch (error) {
    console.error('Error fetching trending parks:', error);
    return NextResponse.json({ error: 'Failed to fetch trending parks' }, { status: 500 });
  }
}
