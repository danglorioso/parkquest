import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, desc, and, or, sql, notInArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { posts, parks, userProfiles, friendships, visits } from '@/lib/db/schema';
import { getBlockedIds } from '@/lib/blocks';
import { getReportedPostIds } from '@/lib/reportedContent';

// GET /api/parks/:park_code/posts — recent community activity for a park's
// detail page. Splits into the viewer's own posts vs everyone else's, and
// drops posts with no visible content (no caption, no photos, no comments,
// not a badge share) so the section never shows an empty-looking card.
const CANDIDATE_LIMIT = 30;
const SECTION_LIMIT = 4;

const effectiveVisibility = sql`COALESCE(${visits.visibility}, ${posts.visibility}, 'public')`;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ park_code: string }> }
) {
  try {
    const { userId: viewerId } = await auth();
    const { park_code } = await params;

    const friendIds = viewerId
      ? (
          await db
            .select({
              friend_id: sql<string>`CASE WHEN ${friendships.requester_id} = ${viewerId} THEN ${friendships.recipient_id} ELSE ${friendships.requester_id} END`,
            })
            .from(friendships)
            .where(
              and(
                or(eq(friendships.requester_id, viewerId), eq(friendships.recipient_id, viewerId)),
                eq(friendships.status, 'accepted')
              )
            )
        ).map((r) => r.friend_id)
      : [];
    const friendIdSet = new Set(friendIds);

    const visibilityFilter = viewerId
      ? or(
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
        )
      : sql`${effectiveVisibility} = 'public'`;

    const conditions = [eq(posts.park_code, park_code), visibilityFilter];
    if (viewerId) {
      const blockedIds = await getBlockedIds(viewerId);
      if (blockedIds.length > 0) conditions.push(notInArray(posts.clerk_user_id, blockedIds));
      const reportedPostIds = await getReportedPostIds(viewerId);
      if (reportedPostIds.length > 0) conditions.push(notInArray(posts.id, reportedPostIds));
    }

    const rows = await db
      .select({
        id: posts.id,
        caption: posts.caption,
        photos: posts.photos,
        park_code: posts.park_code,
        park_name: parks.name,
        park_image_url: parks.image_url,
        visit_id: posts.visit_id,
        quoted_post_id: posts.quoted_post_id,
        badge_id: posts.badge_id,
        visibility: sql<string>`${effectiveVisibility}`,
        created_at: posts.created_at,
        clerk_user_id: posts.clerk_user_id,
        username: userProfiles.username,
        display_name: userProfiles.display_name,
        avatar_url: userProfiles.avatar_url,
        like_count: sql<number>`(SELECT COUNT(*)::int FROM likes WHERE likes.post_id = ${posts.id})`,
        comment_count: sql<number>`(SELECT COUNT(*)::int FROM comments WHERE comments.post_id = ${posts.id})`,
        liked_by_me: viewerId
          ? sql<boolean>`EXISTS(SELECT 1 FROM likes WHERE likes.post_id = ${posts.id} AND likes.user_id = ${viewerId})`
          : sql<boolean>`false`,
        visit_date: visits.visited_date,
        visit_rating: visits.rating,
        visit_activities: visits.activities,
        visit_weather: visits.weather_conditions,
        visit_crowd: visits.crowd,
        visit_difficulty: visits.difficulty,
        visit_companion_count: sql<number>`COALESCE(jsonb_array_length(${visits.companions}), 0)`,
        visit_companion_names: sql<Array<{ user_id: string; username: string; display_name: string | null; avatar_url: string | null }> | null>`(SELECT json_agg(json_build_object('user_id', up.clerk_user_id, 'username', up.username, 'display_name', up.display_name, 'avatar_url', up.avatar_url)) FROM user_profiles up WHERE up.clerk_user_id = ANY(SELECT jsonb_array_elements_text(${visits.companions})))`,
        visit_highlight: visits.highlight,
        visit_title: visits.title,
        visit_ordinal: sql<number>`(SELECT COUNT(*)::int FROM visits v2 WHERE v2.clerk_user_id = ${posts.clerk_user_id} AND v2.park_code = ${posts.park_code} AND v2.visited_date IS NOT NULL AND v2.is_bucket_list = false AND (v2.visited_date < ${visits.visited_date} OR (v2.visited_date = ${visits.visited_date} AND v2.id <= ${visits.id})))`,
      })
      .from(posts)
      .leftJoin(parks, eq(posts.park_code, parks.park_code))
      .leftJoin(userProfiles, eq(posts.clerk_user_id, userProfiles.clerk_user_id))
      .leftJoin(visits, eq(posts.visit_id, visits.id))
      .where(and(...conditions))
      .orderBy(desc(posts.created_at))
      .limit(CANDIDATE_LIMIT);

    const normalized = rows
      .map((p) => ({
        ...p,
        photos: Array.isArray(p.photos)
          ? (p.photos as Array<{ url: string } | string>).map((ph) => (typeof ph === 'string' ? ph : ph.url))
          : null,
        quoted_post: null,
        is_friend_post: p.clerk_user_id === viewerId || friendIdSet.has(p.clerk_user_id),
        visit_date: p.visit_date ? p.visit_date.toISOString() : null,
      }))
      .filter((p) => !!p.caption?.trim() || (p.photos?.length ?? 0) > 0 || p.comment_count > 0 || !!p.badge_id);

    const yours = viewerId ? normalized.filter((p) => p.clerk_user_id === viewerId).slice(0, SECTION_LIMIT) : [];
    const community = normalized.filter((p) => p.clerk_user_id !== viewerId).slice(0, SECTION_LIMIT);

    return NextResponse.json({ yours, community });
  } catch (error) {
    console.error('Error fetching park posts:', error);
    return NextResponse.json({ error: 'Failed to fetch park posts' }, { status: 500 });
  }
}
