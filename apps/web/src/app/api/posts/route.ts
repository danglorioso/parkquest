import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, desc, and, or, inArray, notInArray, sql, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { posts, parks, userProfiles, friendships, notifications, visits } from '@/lib/db/schema';
import { getBlockedIds } from '@/lib/blocks';
import { getReportedPostIds } from '@/lib/reportedContent';

const VISIBILITIES = ['public', 'friends', 'private'] as const;

// Visit posts inherit the linked visit's visibility; everything else uses the post's own
const effectiveVisibility = sql`COALESCE(${visits.visibility}, ${posts.visibility}, 'public')`;

function visibilityFilter(viewerId: string | null) {
  if (!viewerId) return sql`${effectiveVisibility} = 'public'`;
  return or(
    eq(posts.clerk_user_id, viewerId),
    sql`${effectiveVisibility} = 'public'`,
    and(
      sql`${effectiveVisibility} = 'friends'`,
      sql`EXISTS(
        SELECT 1 FROM friendships f
        WHERE f.status = 'accepted'
          AND ((f.requester_id = ${viewerId} AND f.recipient_id = ${posts.clerk_user_id})
            OR (f.recipient_id = ${viewerId} AND f.requester_id = ${posts.clerk_user_id}))
      )`
    )
  );
}

export async function GET(request: Request) {
  try {
    const { userId: viewerId } = await auth();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const parkCode = searchParams.get('parkCode');
    const limit = Math.min(Number(searchParams.get('limit') ?? '20'), 50);
    const offset = Number(searchParams.get('offset') ?? '0');

    const query = db
      .select({
        id: posts.id,
        caption: posts.caption,
        photos: posts.photos,
        park_code: posts.park_code,
        visit_id: posts.visit_id,
        visibility: sql<string>`${effectiveVisibility}`,
        quoted_post_id: posts.quoted_post_id,
        badge_id: posts.badge_id,
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
      .leftJoin(visits, eq(posts.visit_id, visits.id));

    // Collected into a single where() — drizzle overwrites on repeated calls
    const badgeId = searchParams.get('badgeId');
    const conditions = [visibilityFilter(viewerId)];
    if (userId) conditions.push(eq(posts.clerk_user_id, userId));
    if (parkCode) conditions.push(eq(posts.park_code, parkCode));
    if (badgeId) conditions.push(eq(posts.badge_id, badgeId));
    if (viewerId) {
      const blockedIds = await getBlockedIds(viewerId);
      if (blockedIds.length > 0) conditions.push(notInArray(posts.clerk_user_id, blockedIds));
      const reportedPostIds = await getReportedPostIds(viewerId);
      if (reportedPostIds.length > 0) conditions.push(notInArray(posts.id, reportedPostIds));
    }

    const results = await query
      .where(and(...conditions))
      .orderBy(desc(posts.created_at))
      .limit(limit)
      .offset(offset);
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

    const { caption, photos, park_code, visit_id, quoted_post_id, badge_id, visibility } = await request.json();
    const postVisibility = VISIBILITIES.includes(visibility) ? visibility : 'public';

    const isBadgePost = !!badge_id;
    const isQuotePost = !!quoted_post_id;
    const isVisitPost = !!visit_id;

    if (!isBadgePost && !isQuotePost && !isVisitPost && !caption && (!photos || photos.length === 0)) {
      return NextResponse.json({ error: 'Post must have a caption or photos' }, { status: 400 });
    }

    if (isBadgePost) {
      const [existing] = await db
        .select({ id: posts.id })
        .from(posts)
        .where(and(eq(posts.clerk_user_id, userId), eq(posts.badge_id, badge_id)))
        .limit(1);
      if (existing) {
        return NextResponse.json({ error: 'You have already shared this badge' }, { status: 409 });
      }
    }

    const [post] = await db
      .insert(posts)
      .values({
        clerk_user_id: userId,
        caption: caption ?? null,
        photos: photos ?? null,
        park_code: park_code ?? null,
        visit_id: visit_id ?? null,
        quoted_post_id: quoted_post_id ?? null,
        badge_id: badge_id ?? null,
        visibility: postVisibility,
      })
      .returning();

    // Notify friends (fire and forget) — not for private posts
    if (postVisibility !== 'private') {
      db.select({
          friend_id: sql<string>`CASE WHEN ${friendships.requester_id} = ${userId} THEN ${friendships.recipient_id} ELSE ${friendships.requester_id} END`,
        })
        .from(friendships)
        .where(
          and(
            or(eq(friendships.requester_id, userId), eq(friendships.recipient_id, userId)),
            eq(friendships.status, 'accepted')
          )
        )
        .then((friends) => {
          if (friends.length === 0) return;
          return db.insert(notifications).values(
            friends.map(({ friend_id }) => ({
              recipient_id: friend_id,
              actor_id: userId,
              type: 'post' as const,
              post_id: post.id,
              park_code: park_code ?? null,
            }))
          );
        })
        .catch(() => {});
    }

    return NextResponse.json(post, { status: 201 });
  } catch (error) {
    console.error('Error creating post:', error);
    return NextResponse.json({ error: 'Failed to create post' }, { status: 500 });
  }
}
