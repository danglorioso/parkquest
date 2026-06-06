import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, count, and, or, isNotNull, sql } from 'drizzle-orm';
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
        id:         posts.id,
        caption:    posts.caption,
        photos:     posts.photos,
        park_code:  posts.park_code,
        park_name:  parks.name,
        created_at: posts.created_at,
      })
        .from(posts)
        .leftJoin(parks, eq(posts.park_code, parks.park_code))
        .where(eq(posts.clerk_user_id, targetId))
        .orderBy(sql`${posts.created_at} desc`)
        .limit(9),
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

    // Journal entries: visibility-filtered, most recent first
    const journal = actualVisits
      .filter((v) => {
        const vis = v.visibility ?? 'private';
        if (canSeePrivate) return true;
        if (canSeeFriends && (vis === 'public' || vis === 'friends')) return true;
        return vis === 'public';
      })
      .map((v) => ({
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
      }));

    // Badges with metadata, most recent first
    const badges = earnedBadges.map((b) => ({
      badge_id:  b.badge_id,
      earned_at: b.earned_at,
      name:      BADGE_MAP.get(b.badge_id)?.name ?? b.badge_id,
      emoji:     BADGE_MAP.get(b.badge_id)?.emoji ?? '🏅',
      tier:      BADGE_MAP.get(b.badge_id)?.tier ?? 'bronze',
    })).reverse();

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
      recent_posts:      recentPosts,
      journal,
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}
