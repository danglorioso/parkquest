import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, count, and, or, isNotNull, sql, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { userProfiles, visits, friendships, parks, userBadges, posts } from '@/lib/db/schema';
import { ALL_BADGES } from '@/lib/badges';

const BADGE_MAP = new Map(ALL_BADGES.map((b) => [b.id, { name: b.name, emoji: b.emoji, tier: b.tier }]));

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { userId: viewerId } = await auth();
    const { username } = await params;

    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.username, username))
      .limit(1);

    if (!profile) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const targetId = profile.clerk_user_id;
    const isOwnProfile = viewerId === targetId;
    const isOtherUser = !isOwnProfile && !!viewerId;

    // Run all queries in parallel
    const [
      [visitCountRow],
      [friendCountRow],
      allVisitsRaw,
      earnedBadges,
      recentPosts,
      friendshipRows,
      viewerFriends,
      targetFriends,
    ] = await Promise.all([
      db.select({ count: count() }).from(visits).where(and(
        eq(visits.clerk_user_id, targetId),
        eq(visits.is_bucket_list, false),
        isNotNull(visits.visited_date),
      )),
      db.select({ count: count() }).from(friendships).where(and(
        or(eq(friendships.requester_id, targetId), eq(friendships.recipient_id, targetId)),
        eq(friendships.status, 'accepted'),
      )),
      db.select({
        id:           visits.id,
        park_code:    parks.park_code,
        name:         parks.name,
        states:       parks.states,
        latitude:     parks.latitude,
        longitude:    parks.longitude,
        image_url:    parks.image_url,
        visited_date: visits.visited_date,
        is_bucket_list: visits.is_bucket_list,
        visibility:   visits.visibility,
        title:        visits.title,
        notes:        visits.notes,
        rating:       visits.rating,
        activities:   visits.activities,
      })
        .from(visits)
        .innerJoin(parks, eq(visits.park_code, parks.park_code))
        .where(eq(visits.clerk_user_id, targetId))
        .orderBy(sql`${visits.visited_date} desc nulls last`),
      db.select({ badge_id: userBadges.badge_id, earned_at: userBadges.earned_at })
        .from(userBadges)
        .where(eq(userBadges.clerk_user_id, targetId))
        .orderBy(userBadges.earned_at),
      db.select({
        id:                   posts.id,
        caption:              posts.caption,
        photos:               posts.photos,
        park_code:            posts.park_code,
        park_name:            parks.name,
        badge_id:             posts.badge_id,
        quoted_post_id:       posts.quoted_post_id,
        visit_id:             posts.visit_id,
        visit_visibility:     visits.visibility,
        post_visibility:      posts.visibility,
        created_at:           posts.created_at,
        clerk_user_id:        posts.clerk_user_id,
        username:             userProfiles.username,
        display_name:         userProfiles.display_name,
        avatar_url:           userProfiles.avatar_url,
        like_count:           sql<number>`(SELECT COUNT(*)::int FROM likes WHERE likes.post_id = ${posts.id})`,
        comment_count:        sql<number>`(SELECT COUNT(*)::int FROM comments WHERE comments.post_id = ${posts.id})`,
        liked_by_me:          viewerId
          ? sql<boolean>`EXISTS(SELECT 1 FROM likes WHERE likes.post_id = ${posts.id} AND likes.user_id = ${viewerId})`
          : sql<boolean>`false`,
        visit_date:           visits.visited_date,
        visit_rating:         visits.rating,
        visit_activities:     visits.activities,
        visit_weather:        visits.weather_conditions,
        visit_crowd:          visits.crowd,
        visit_difficulty:     visits.difficulty,
        visit_companion_count: sql<number>`COALESCE(jsonb_array_length(${visits.companions}), 0)`,
        visit_companion_names: sql<Array<{username: string; display_name: string | null; avatar_url: string | null}> | null>`(SELECT json_agg(json_build_object('username', up.username, 'display_name', up.display_name, 'avatar_url', up.avatar_url)) FROM user_profiles up WHERE up.clerk_user_id = ANY(SELECT jsonb_array_elements_text(${visits.companions})))`,
        visit_highlight:      visits.highlight,
      })
        .from(posts)
        .leftJoin(parks, eq(posts.park_code, parks.park_code))
        .leftJoin(visits, eq(posts.visit_id, visits.id))
        .leftJoin(userProfiles, eq(posts.clerk_user_id, userProfiles.clerk_user_id))
        .where(eq(posts.clerk_user_id, targetId))
        .orderBy(desc(posts.created_at))
        .limit(20),
      // Friendship row between viewer and target
      isOtherUser
        ? db.select().from(friendships).where(or(
            and(eq(friendships.requester_id, viewerId!), eq(friendships.recipient_id, targetId)),
            and(eq(friendships.requester_id, targetId), eq(friendships.recipient_id, viewerId!)),
          )).limit(1)
        : Promise.resolve([] as typeof friendships.$inferSelect[]),
      // Viewer's accepted friends (for mutual count)
      isOtherUser
        ? db.select({
            friend_id: sql<string>`CASE WHEN ${friendships.requester_id} = ${viewerId} THEN ${friendships.recipient_id} ELSE ${friendships.requester_id} END`,
          }).from(friendships).where(and(
            or(eq(friendships.requester_id, viewerId!), eq(friendships.recipient_id, viewerId!)),
            eq(friendships.status, 'accepted'),
          ))
        : Promise.resolve([] as { friend_id: string }[]),
      // Target's accepted friends
      isOtherUser
        ? db.select({
            friend_id: sql<string>`CASE WHEN ${friendships.requester_id} = ${targetId} THEN ${friendships.recipient_id} ELSE ${friendships.requester_id} END`,
          }).from(friendships).where(and(
            or(eq(friendships.requester_id, targetId), eq(friendships.recipient_id, targetId)),
            eq(friendships.status, 'accepted'),
          ))
        : Promise.resolve([] as { friend_id: string }[]),
    ]);

    // Resolve friendship status
    let friendship_status: 'none' | 'pending_sent' | 'pending_received' | 'accepted' = 'none';
    let friendship_id: number | null = null;
    const existing = friendshipRows[0];
    if (existing) {
      friendship_id = existing.id;
      if (existing.status === 'accepted') {
        friendship_status = 'accepted';
      } else if (existing.status === 'pending') {
        friendship_status = existing.requester_id === viewerId ? 'pending_sent' : 'pending_received';
      }
    }

    // Mutual friends
    const viewerSet = new Set(viewerFriends.map((r) => r.friend_id));
    const mutual_friends = targetFriends.filter((r) => viewerSet.has(r.friend_id)).length;

    // Visibility rules for journal entries
    const isFriend = friendship_status === 'accepted';
    const canSeeFriends = isOwnProfile || isFriend;
    const canSeePrivate = isOwnProfile;

    // Derive visit subsets
    const actualVisits = allVisitsRaw.filter((v) => !v.is_bucket_list && v.visited_date);
    const bucketList   = allVisitsRaw.filter((v) => v.is_bucket_list);

    const statesVisited = new Set<string>();
    for (const v of actualVisits) {
      for (const s of v.states.split(',').map((s) => s.trim()).filter(Boolean)) {
        statesVisited.add(s);
      }
    }

    // Visited parks (map + stamps): all actual visits, no visibility filter (just counts/locations)
    const visitedParks = actualVisits;

    // Journal entries: visible ones shown in full, private ones shown as redacted placeholders
    const journal = actualVisits.map((v) => {
      const vis = v.visibility ?? 'private';
      const canSee = canSeePrivate
        || (canSeeFriends && (vis === 'public' || vis === 'friends'))
        || vis === 'public';

      if (canSee) {
        return {
          visit_id:     v.id,
          visited_date: v.visited_date,
          park_code:    v.park_code,
          park_name:    v.name,
          states:       v.states,
          title:        v.title,
          notes:        v.notes,
          rating:       v.rating,
          activities:   v.activities,
          visibility:   v.visibility,
          redacted:     false,
        };
      }
      // Redacted: only preserve the date so it can be grouped by month/year
      return {
        visit_id:     v.id,
        visited_date: v.visited_date,
        park_code:    null,
        park_name:    null,
        states:       null,
        title:        null,
        notes:        null,
        rating:       null,
        activities:   null,
        visibility:   v.visibility,
        redacted:     true,
      };
    });

    // Badges with metadata, most recent first
    const badges = earnedBadges.map((b) => ({
      badge_id:  b.badge_id,
      earned_at: b.earned_at,
      name:      BADGE_MAP.get(b.badge_id)?.name ?? b.badge_id,
      emoji:     BADGE_MAP.get(b.badge_id)?.emoji ?? '🏅',
      tier:      BADGE_MAP.get(b.badge_id)?.tier ?? 'bronze',
    })).reverse();

    // Filter posts by visibility: visit posts defer to the linked visit's
    // visibility, all other posts (badge/quote/plain) use their own
    const visiblePosts = recentPosts
      .filter((p) => {
        const vis = p.visit_visibility ?? p.post_visibility ?? 'public';
        if (canSeePrivate) return true;
        if (vis === 'private') return false;
        if (vis === 'friends') return canSeeFriends;
        return true; // public
      })
      .map((p) => ({
        id:                   p.id,
        caption:              p.caption,
        visit_id:             p.visit_id,
        photos:               Array.isArray(p.photos)
          ? (p.photos as Array<{ url: string } | string>).map(ph => typeof ph === 'string' ? ph : ph.url)
          : null,
        park_code:            p.park_code,
        park_name:            p.park_name,
        badge_id:             p.badge_id,
        quoted_post_id:       p.quoted_post_id,
        quoted_post:          null,
        created_at:           p.created_at,
        clerk_user_id:        p.clerk_user_id,
        username:             p.username,
        display_name:         p.display_name,
        avatar_url:           p.avatar_url,
        like_count:           p.like_count,
        comment_count:        p.comment_count,
        liked_by_me:          p.liked_by_me,
        is_friend_post:       true,
        visit_date:           p.visit_date ? p.visit_date.toISOString() : null,
        visit_rating:         p.visit_rating,
        visit_activities:     p.visit_activities,
        visit_weather:        p.visit_weather,
        visit_crowd:          p.visit_crowd,
        visit_difficulty:     p.visit_difficulty,
        visit_companion_count: p.visit_companion_count,
        visit_companion_names: p.visit_companion_names,
        visit_highlight:      p.visit_highlight,
      }));

    return NextResponse.json({
      ...profile,
      parks_visited:     visitCountRow.count,
      states_visited:    statesVisited.size,
      bucket_list_count: bucketList.length,
      friend_count:      friendCountRow.count,
      badges,
      friendship_status,
      friendship_id,
      mutual_friends,
      is_own_profile:    isOwnProfile,
      recent_visits:     visitedParks.slice(0, 6),
      visited_parks:     visitedParks,
      recent_posts:      visiblePosts,
      journal,
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}
