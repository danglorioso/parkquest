import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, desc, and, or, inArray, notInArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { posts, friendships, parks, userProfiles, visits } from '@/lib/db/schema';
import { getBlockedIds } from '@/lib/blocks';
import { getReportedPostIds } from '@/lib/reportedContent';
import { touchActivity } from '@/lib/activity';

export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    touchActivity(userId);

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get('limit') ?? '20'), 50);
    const offset = Number(searchParams.get('offset') ?? '0');
    // Optional: restrict to a single author (profile pages). Same visibility
    // rules apply, so strangers only ever see the author's public posts.
    const author = searchParams.get('author');
    // Optional: restrict to a single park (park page's Community tab).
    const park = searchParams.get('park');

    // Fetch accepted friend IDs
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

    const friendIdList = friendRows.map(r => r.friend_id);
    const friendIds = new Set(friendIdList);
    const blockedIds = await getBlockedIds(userId);
    const reportedPostIds = await getReportedPostIds(userId);

    // Fetch only the user's own posts and friends' posts
    const allowedIds = [userId, ...friendIdList];
    const feedPosts = await db
      .select({
        id: posts.id,
        caption: posts.caption,
        photos: posts.photos,
        park_code: posts.park_code,
        visit_id: posts.visit_id,
        quoted_post_id: posts.quoted_post_id,
        badge_id: posts.badge_id,
        created_at: posts.created_at,
        clerk_user_id: posts.clerk_user_id,
        park_name: parks.name,
        park_image_url: parks.image_url,
        park_states: parks.states,
        is_national_park: sql<boolean>`COALESCE(${parks.is_national_park}, false)`,
        username: userProfiles.username,
        display_name: userProfiles.display_name,
        avatar_url: userProfiles.avatar_url,
        author_is_admin: userProfiles.is_admin,
        like_count: sql<number>`(SELECT COUNT(*)::int FROM likes WHERE likes.post_id = ${posts.id})`,
        comment_count: sql<number>`(SELECT COUNT(*)::int FROM comments WHERE comments.post_id = ${posts.id})`,
        liked_by_me: sql<boolean>`EXISTS(SELECT 1 FROM likes WHERE likes.post_id = ${posts.id} AND likes.user_id = ${userId})`,
        visibility: sql<string>`COALESCE(${visits.visibility}, ${posts.visibility}, 'public')`,
        visit_date:             visits.visited_date,
        visit_rating:           visits.rating,
        visit_activities:       visits.activities,
        visit_weather:          visits.weather_conditions,
        visit_crowd:            visits.crowd,
        visit_difficulty:       visits.difficulty,
        visit_companion_count:  sql<number>`COALESCE(jsonb_array_length(${visits.companions}), 0)`,
        visit_companion_names:  sql<Array<{user_id: string; username: string; display_name: string | null; avatar_url: string | null}> | null>`(SELECT json_agg(json_build_object('user_id', up.clerk_user_id, 'username', up.username, 'display_name', up.display_name, 'avatar_url', up.avatar_url)) FROM user_profiles up WHERE up.clerk_user_id = ANY(SELECT jsonb_array_elements_text(${visits.companions})))`,
        visit_highlight:        visits.highlight,
        visit_title:            visits.title,
        visit_distance_meters:       visits.distance_meters,
        visit_duration_seconds:      visits.duration_seconds,
        visit_elevation_gain_meters: visits.elevation_gain_meters,
        visit_route_polyline:        visits.route_polyline,
        visit_external_source:       visits.external_source,
        visit_ordinal: sql<number>`(SELECT COUNT(*)::int FROM visits v2 WHERE v2.clerk_user_id = ${posts.clerk_user_id} AND v2.park_code = ${posts.park_code} AND v2.visited_date IS NOT NULL AND v2.is_bucket_list = false AND (v2.visited_date < ${visits.visited_date} OR (v2.visited_date = ${visits.visited_date} AND v2.id <= ${visits.id})))`,
      })
      .from(posts)
      .leftJoin(parks, eq(posts.park_code, parks.park_code))
      .leftJoin(userProfiles, eq(posts.clerk_user_id, userProfiles.clerk_user_id))
      .leftJoin(visits, eq(posts.visit_id, visits.id))
      .where(
        and(
          author ? eq(posts.clerk_user_id, author) : undefined,
          park ? eq(posts.park_code, park) : undefined,
          blockedIds.length > 0 ? notInArray(posts.clerk_user_id, blockedIds) : undefined,
          reportedPostIds.length > 0 ? notInArray(posts.id, reportedPostIds) : undefined,
          or(
            // Own posts regardless of visibility
            eq(posts.clerk_user_id, userId),
            // Public posts from anyone
            sql`COALESCE(${visits.visibility}, ${posts.visibility}, 'public') = 'public'`,
            // Friends-only posts from accepted friends
            and(
              inArray(posts.clerk_user_id, allowedIds),
              sql`COALESCE(${visits.visibility}, ${posts.visibility}, 'public') = 'friends'`
            )
          )
        )
      )
      .orderBy(desc(posts.created_at))
      .limit(limit)
      .offset(offset);

    // Fetch quoted posts in one batch
    const quotedIds = feedPosts
      .map(p => p.quoted_post_id)
      .filter((id): id is number => id != null);

    let quotedMap = new Map<number, object>();
    if (quotedIds.length > 0) {
      const quotedPosts = await db
        .select({
          id: posts.id,
          caption: posts.caption,
          photos: posts.photos,
          park_code: posts.park_code,
          badge_id: posts.badge_id,
          created_at: posts.created_at,
          clerk_user_id: posts.clerk_user_id,
          park_name: parks.name,
          username: userProfiles.username,
          display_name: userProfiles.display_name,
          avatar_url: userProfiles.avatar_url,
        })
        .from(posts)
        .leftJoin(parks, eq(posts.park_code, parks.park_code))
        .leftJoin(userProfiles, eq(posts.clerk_user_id, userProfiles.clerk_user_id))
        .where(inArray(posts.id, quotedIds));

      for (const qp of quotedPosts) {
        quotedMap.set(qp.id, {
          ...qp,
          photos: Array.isArray(qp.photos)
            ? (qp.photos as Array<{ url: string } | string>).map(ph =>
                typeof ph === 'string' ? ph : ph.url
              )
            : null,
        });
      }
    }

    // Normalize and annotate
    const normalized = feedPosts.map(p => ({
      ...p,
      is_friend_post: p.clerk_user_id === userId || friendIds.has(p.clerk_user_id),
      photos: Array.isArray(p.photos)
        ? (p.photos as Array<{ url: string } | string>).map(ph =>
            typeof ph === 'string' ? ph : ph.url
          )
        : null,
      quoted_post: p.quoted_post_id ? quotedMap.get(p.quoted_post_id) ?? null : null,
      visit_date: p.visit_date ? p.visit_date.toISOString() : null,
    }));

    return NextResponse.json(normalized);
  } catch (error) {
    console.error('Error fetching feed:', error);
    return NextResponse.json({ error: 'Failed to fetch feed' }, { status: 500 });
  }
}
