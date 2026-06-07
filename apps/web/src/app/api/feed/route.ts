import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, desc, and, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { posts, friendships, parks, userProfiles } from '@/lib/db/schema';

export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get('limit') ?? '20'), 50);
    const offset = Number(searchParams.get('offset') ?? '0');

    const friendRows = await db
      .select({
        friend_id: sql<string>`CASE WHEN ${friendships.requester_id} = ${userId} THEN ${friendships.recipient_id} ELSE ${friendships.requester_id} END`,
      })
      .from(friendships)
      .where(
        and(
          or(eq(friendships.requester_id, userId), eq(friendships.recipient_id, userId)),
          eq(friendships.status, 'accepted')
        )
      );

    const friendIds = friendRows.map(r => r.friend_id);

    // Show all posts (all are public); rank own + friends' posts first
    const friendListLiteral = friendIds.length > 0
      ? `ARRAY[${friendIds.map(id => `'${id}'`).join(',')}]::text[]`
      : `ARRAY[]::text[]`;

    const feedPosts = await db
      .select({
        id: posts.id,
        caption: posts.caption,
        photos: posts.photos,
        park_code: posts.park_code,
        visit_id: posts.visit_id,
        created_at: posts.created_at,
        clerk_user_id: posts.clerk_user_id,
        park_name: parks.name,
        username: userProfiles.username,
        display_name: userProfiles.display_name,
        avatar_url: userProfiles.avatar_url,
        like_count: sql<number>`(SELECT COUNT(*)::int FROM likes WHERE likes.post_id = ${posts.id})`,
        comment_count: sql<number>`(SELECT COUNT(*)::int FROM comments WHERE comments.post_id = ${posts.id})`,
        liked_by_me: sql<boolean>`EXISTS(SELECT 1 FROM likes WHERE likes.post_id = ${posts.id} AND likes.user_id = ${userId})`,
        is_friend_post: sql<boolean>`(${posts.clerk_user_id} = ${userId} OR ${posts.clerk_user_id} = ANY(${sql.raw(friendListLiteral)}))`,
      })
      .from(posts)
      .leftJoin(parks, eq(posts.park_code, parks.park_code))
      .leftJoin(userProfiles, eq(posts.clerk_user_id, userProfiles.clerk_user_id))
      .orderBy(
        sql`(${posts.clerk_user_id} = ${userId} OR ${posts.clerk_user_id} = ANY(${sql.raw(friendListLiteral)})) DESC`,
        desc(posts.created_at),
      )
      .limit(limit)
      .offset(offset);

    // Extract photo URLs from stored objects
    const normalized = feedPosts.map(p => ({
      ...p,
      photos: Array.isArray(p.photos)
        ? (p.photos as Array<{ url: string } | string>).map(ph =>
            typeof ph === 'string' ? ph : ph.url
          )
        : null,
    }));

    return NextResponse.json(normalized);
  } catch (error) {
    console.error('Error fetching feed:', error);
    return NextResponse.json({ error: 'Failed to fetch feed' }, { status: 500 });
  }
}
