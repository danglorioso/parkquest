import { NextResponse } from 'next/server';
import { ilike, or, ne, and, sql, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { userProfiles } from '@/lib/db/schema';
import { auth } from '@clerk/nextjs/server';

export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    const { searchParams } = new URL(request.url);

    // Batch lookup by clerk_user_ids
    const ids = searchParams.get('ids');
    if (ids) {
      const idList = ids.split(',').map(s => s.trim()).filter(Boolean).slice(0, 50);
      if (!idList.length) return NextResponse.json([]);
      const results = await db
        .select({
          clerk_user_id: userProfiles.clerk_user_id,
          username: userProfiles.username,
          display_name: userProfiles.display_name,
          avatar_url: userProfiles.avatar_url,
        })
        .from(userProfiles)
        .where(inArray(userProfiles.clerk_user_id, idList));
      return NextResponse.json(results);
    }

    const search = searchParams.get('search')?.trim() ?? searchParams.get('q')?.trim();
    const limit = Math.min(Number(searchParams.get('limit') ?? '20'), 50);
    const offset = Number(searchParams.get('offset') ?? '0');

    if (!search) return NextResponse.json([]);

    const pattern = `%${search}%`;

    const nameMatch = or(
      ilike(userProfiles.username, pattern),
      sql`coalesce(${userProfiles.display_name}, '') ilike ${pattern}`,
    );

    const results = await db
      .select({
        clerk_user_id: userProfiles.clerk_user_id,
        username: userProfiles.username,
        display_name: userProfiles.display_name,
        avatar_url: userProfiles.avatar_url,
      })
      .from(userProfiles)
      .where(userId ? and(nameMatch, ne(userProfiles.clerk_user_id, userId)) : nameMatch)
      .limit(limit)
      .offset(offset);

    return NextResponse.json(results);
  } catch (error) {
    console.error('Error searching users:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'Failed to search users', detail: message }, { status: 500 });
  }
}
