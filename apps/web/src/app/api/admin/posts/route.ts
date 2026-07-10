import { NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { posts, userProfiles, parks } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/admin';

const PAGE_SIZE = 25;

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const rows = await db
    .select({
      id: posts.id,
      caption: posts.caption,
      created_at: posts.created_at,
      clerk_user_id: posts.clerk_user_id,
      username: userProfiles.username,
      display_name: userProfiles.display_name,
      park_name: parks.name,
    })
    .from(posts)
    .leftJoin(userProfiles, eq(posts.clerk_user_id, userProfiles.clerk_user_id))
    .leftJoin(parks, eq(posts.park_code, parks.park_code))
    .orderBy(desc(posts.created_at))
    .limit(PAGE_SIZE + 1)
    .offset(offset);

  const hasMore = rows.length > PAGE_SIZE;
  return NextResponse.json({ posts: rows.slice(0, PAGE_SIZE), page, has_more: hasMore });
}
