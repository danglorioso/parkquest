import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, desc, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { posts, parks, userProfiles, follows, notifications } from '@/lib/db/schema';

function enrichedPostsQuery(whereClause: Parameters<typeof db.select>[0] extends never ? never : any) {
  return db
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
    })
    .from(posts)
    .leftJoin(parks, eq(posts.park_code, parks.park_code))
    .leftJoin(userProfiles, eq(posts.clerk_user_id, userProfiles.clerk_user_id));
}

export async function GET(request: Request) {
  try {
    const { userId: viewerId } = await auth();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const parkCode = searchParams.get('parkCode');
    const limit = Math.min(Number(searchParams.get('limit') ?? '20'), 50);
    const offset = Number(searchParams.get('offset') ?? '0');

    let query = db
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
        liked_by_me: viewerId
          ? sql<boolean>`EXISTS(SELECT 1 FROM likes WHERE likes.post_id = ${posts.id} AND likes.user_id = ${viewerId})`
          : sql<boolean>`false`,
      })
      .from(posts)
      .leftJoin(parks, eq(posts.park_code, parks.park_code))
      .leftJoin(userProfiles, eq(posts.clerk_user_id, userProfiles.clerk_user_id))
      .$dynamic();

    if (userId) query = query.where(eq(posts.clerk_user_id, userId));
    if (parkCode) query = query.where(eq(posts.park_code, parkCode));

    const results = await query.orderBy(desc(posts.created_at)).limit(limit).offset(offset);
    return NextResponse.json(results);
  } catch (error) {
    console.error('Error fetching posts:', error);
    return NextResponse.json({ error: 'Failed to fetch posts' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { caption, photos, park_code, visit_id } = await request.json();
    if (!caption && (!photos || photos.length === 0)) {
      return NextResponse.json({ error: 'Post must have a caption or photos' }, { status: 400 });
    }

    const [post] = await db
      .insert(posts)
      .values({ clerk_user_id: userId, caption: caption ?? null, photos: photos ?? null, park_code: park_code ?? null, visit_id: visit_id ?? null })
      .returning();

    // Notify followers about the new post (fire and forget)
    db.select({ follower_id: follows.follower_id })
      .from(follows)
      .where(eq(follows.following_id, userId))
      .then((followers) => {
        if (followers.length === 0) return;
        return db.insert(notifications).values(
          followers.map(({ follower_id }) => ({
            recipient_id: follower_id,
            actor_id: userId,
            type: 'post' as const,
            post_id: post.id,
            park_code: park_code ?? null,
          }))
        );
      })
      .catch(() => {});

    return NextResponse.json(post, { status: 201 });
  } catch (error) {
    console.error('Error creating post:', error);
    return NextResponse.json({ error: 'Failed to create post' }, { status: 500 });
  }
}
