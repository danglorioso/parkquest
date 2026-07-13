import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, count, and, or, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { userProfiles, visits, friendships, parks, userBadges } from '@/lib/db/schema';
import { getBadgeDisplayMap } from '@/lib/badgeDefs';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId: viewerId } = await auth();
    const { userId } = await params;
    const BADGE_MAP = await getBadgeDisplayMap();

    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.clerk_user_id, userId))
      .limit(1);

    if (!profile) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const isOwnProfile = viewerId === userId;
    const isOtherUser = !isOwnProfile && !!viewerId;

    const [[visitStats], [friendCountRow], earnedBadges, allVisitsRaw, friendshipRows] = await Promise.all([
      db
        .select({ count: count() })
        .from(visits)
        .where(sql`${visits.clerk_user_id} = ${userId} AND ${visits.is_bucket_list} = false AND ${visits.visited_date} IS NOT NULL`),
      db.select({ count: count() }).from(friendships).where(
        and(
          or(eq(friendships.requester_id, userId), eq(friendships.recipient_id, userId)),
          eq(friendships.status, 'accepted')
        )
      ),
      db
        .select({ badge_id: userBadges.badge_id, earned_at: userBadges.earned_at })
        .from(userBadges)
        .where(eq(userBadges.clerk_user_id, userId))
        .orderBy(userBadges.earned_at),
      db
        .select({
          visit_id:     visits.id,
          park_code:    parks.park_code,
          park_name:    parks.name,
          states:       parks.states,
          latitude:     parks.latitude,
          longitude:    parks.longitude,
          visited_date: visits.visited_date,
          title:        visits.title,
          notes:        visits.notes,
          rating:       visits.rating,
          activities:   visits.activities,
          visibility:   visits.visibility,
        })
        .from(visits)
        .innerJoin(parks, eq(visits.park_code, parks.park_code))
        .where(and(
          eq(visits.clerk_user_id, userId),
          eq(visits.is_bucket_list, false),
          isNotNull(visits.visited_date),
        ))
        .orderBy(sql`${visits.visited_date} desc nulls last`),
      isOtherUser
        ? db.select().from(friendships).where(or(
            and(eq(friendships.requester_id, viewerId!), eq(friendships.recipient_id, userId)),
            and(eq(friendships.requester_id, userId), eq(friendships.recipient_id, viewerId!)),
          )).limit(1)
        : Promise.resolve([] as typeof friendships.$inferSelect[]),
    ]);

    let friendship_status: 'none' | 'pending_sent' | 'pending_received' | 'accepted' = 'none';
    const existing = friendshipRows[0];
    if (existing) {
      if (existing.status === 'accepted') {
        friendship_status = 'accepted';
      } else if (existing.status === 'pending') {
        friendship_status = existing.requester_id === viewerId ? 'pending_sent' : 'pending_received';
      }
    }

    const isFriend = friendship_status === 'accepted';
    const canSeeFriends = isOwnProfile || isFriend;
    const canSeePrivate = isOwnProfile;

    const journal = allVisitsRaw.map((v) => {
      const vis = v.visibility ?? 'private';
      const canSee = canSeePrivate
        || (canSeeFriends && (vis === 'public' || vis === 'friends'))
        || vis === 'public';
      if (canSee) {
        return {
          visit_id:     v.visit_id,
          visited_date: v.visited_date,
          park_code:    v.park_code,
          park_name:    v.park_name,
          title:        v.title,
          notes:        v.notes,
          rating:       v.rating,
          activities:   v.activities,
          visibility:   v.visibility,
          redacted:     false,
        };
      }
      return {
        visit_id:     v.visit_id,
        visited_date: v.visited_date,
        park_code:    null,
        park_name:    null,
        title:        null,
        notes:        null,
        rating:       null,
        activities:   null,
        visibility:   v.visibility,
        redacted:     true,
      };
    });

    const badges = earnedBadges.map((b) => ({
      badge_id:  b.badge_id,
      earned_at: b.earned_at,
      name:      BADGE_MAP.get(b.badge_id)?.name ?? b.badge_id,
      emoji:     BADGE_MAP.get(b.badge_id)?.emoji ?? '🏅',
      tier:      BADGE_MAP.get(b.badge_id)?.tier ?? 'bronze',
      colors:    BADGE_MAP.get(b.badge_id)?.colors ?? null,
    })).reverse();

    return NextResponse.json({
      ...profile,
      parks_visited: visitStats.count,
      friend_count: friendCountRow.count,
      friendship_status,
      badges,
      visited_parks: allVisitsRaw.map((v) => ({
        park_code:    v.park_code,
        name:         v.park_name,
        states:       v.states,
        latitude:     v.latitude,
        longitude:    v.longitude,
        visited_date: v.visited_date,
      })),
      journal,
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}
