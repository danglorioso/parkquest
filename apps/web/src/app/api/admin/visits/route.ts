import { NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { visits, userProfiles, parks } from '@/lib/db/schema';
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
      id: visits.id,
      visited_date: visits.visited_date,
      rating: visits.rating,
      visibility: visits.visibility,
      is_bucket_list: visits.is_bucket_list,
      clerk_user_id: visits.clerk_user_id,
      username: userProfiles.username,
      display_name: userProfiles.display_name,
      park_name: parks.name,
    })
    .from(visits)
    .leftJoin(userProfiles, eq(visits.clerk_user_id, userProfiles.clerk_user_id))
    .leftJoin(parks, eq(visits.park_code, parks.park_code))
    .orderBy(desc(visits.created_at))
    .limit(PAGE_SIZE + 1)
    .offset(offset);

  const hasMore = rows.length > PAGE_SIZE;
  return NextResponse.json({ visits: rows.slice(0, PAGE_SIZE), page, has_more: hasMore });
}
