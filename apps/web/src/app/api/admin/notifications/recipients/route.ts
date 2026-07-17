import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';

// Lightweight user search for the broadcast page's "specific users" picker.
// The main admin users endpoint is paginated and enriched with Clerk data —
// too heavy for an incremental type-ahead list.
export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') ?? '').trim();

  const rows = q
    ? await db.execute(sql`
        SELECT clerk_user_id, username, display_name, avatar_url
        FROM user_profiles
        WHERE username ILIKE ${'%' + q + '%'} OR display_name ILIKE ${'%' + q + '%'}
        ORDER BY username LIMIT 50
      `)
    : await db.execute(sql`
        SELECT clerk_user_id, username, display_name, avatar_url
        FROM user_profiles
        ORDER BY username LIMIT 50
      `);

  return NextResponse.json({ users: rows.rows });
}
