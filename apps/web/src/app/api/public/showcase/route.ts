import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

// Unauthenticated: a random sample of real public posts for the marketing
// landing page. Only posts with no open/actioned report, effectively-public
// visibility, and a non-trivial caption or highlight are eligible.
export const revalidate = 300;

export async function GET() {
  try {
    const rows = await db.execute(sql`
      SELECT
        p.id,
        p.caption,
        p.badge_id,
        p.created_at,
        p.park_code,
        pk.name AS park_name,
        pk.image_url AS park_image_url,
        pk.states,
        u.username,
        u.display_name,
        v.highlight,
        v.rating,
        (SELECT COUNT(*)::int FROM likes WHERE likes.post_id = p.id) AS like_count,
        (SELECT COUNT(*)::int FROM comments WHERE comments.post_id = p.id) AS comment_count
      FROM posts p
      JOIN user_profiles u ON u.clerk_user_id = p.clerk_user_id
      LEFT JOIN parks pk ON pk.park_code = p.park_code
      LEFT JOIN visits v ON v.id = p.visit_id
      WHERE COALESCE(v.visibility, p.visibility, 'public') = 'public'
        AND (
          (p.caption IS NOT NULL AND length(p.caption) > 12)
          OR (v.highlight IS NOT NULL AND length(v.highlight) > 12)
        )
        AND NOT EXISTS (
          SELECT 1 FROM reports r
          WHERE r.target_type = 'post'
            AND r.target_id = p.id::text
            AND r.status IN ('open', 'actioned')
        )
      ORDER BY random()
      LIMIT 6
    `);

    return NextResponse.json(rows.rows, {
      headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' },
    });
  } catch (error) {
    console.error('GET /api/public/showcase error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
