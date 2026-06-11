import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, count, and, or, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { userProfiles, visits, friendships, parks, userBadges } from '@/lib/db/schema';
import { ALL_BADGES } from '@/lib/badges';

const BADGE_MAP = new Map(ALL_BADGES.map((b) => [b.id, { name: b.name, emoji: b.emoji, tier: b.tier }]));

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId: viewerId } = await auth();
    const { userId } = await params;

    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.clerk_user_id, userId))
      .limit(1);

    if (!profile) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const [[visitStats], [friendCount], earnedBadges, visitedParks] = await Promise.all([
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
          park_code:    parks.park_code,
          name:         parks.name,
          states:       parks.states,
          latitude:     parks.latitude,
          longitude:    parks.longitude,
          visited_date: visits.visited_date,
        })
        .from(visits)
        .innerJoin(parks, eq(visits.park_code, parks.park_code))
        .where(and(
          eq(visits.clerk_user_id, userId),
          eq(visits.is_bucket_list, false),
          isNotNull(visits.visited_date),
        ))
        .orderBy(sql`${visits.visited_date} desc nulls last`),
    ]);

    let friendship_status: 'none' | 'pending_sent' | 'pending_received' | 'accepted' = 'none';
    if (viewerId && viewerId !== userId) {
      const [existing] = await db
        .select()
        .from(friendships)
        .where(
          or(
            and(eq(friendships.requester_id, viewerId), eq(friendships.recipient_id, userId)),
            and(eq(friendships.requester_id, userId), eq(friendships.recipient_id, viewerId))
          )
        )
        .limit(1);

      if (existing) {
        if (existing.status === 'accepted') {
          friendship_status = 'accepted';
        } else if (existing.status === 'pending') {
          friendship_status = existing.requester_id === viewerId ? 'pending_sent' : 'pending_received';
        }
      }
    }

    // Badges with display metadata, most recent first
    const badges = earnedBadges.map((b) => ({
      badge_id:  b.badge_id,
      earned_at: b.earned_at,
      name:      BADGE_MAP.get(b.badge_id)?.name ?? b.badge_id,
      emoji:     BADGE_MAP.get(b.badge_id)?.emoji ?? '🏅',
      tier:      BADGE_MAP.get(b.badge_id)?.tier ?? 'bronze',
    })).reverse();

    return NextResponse.json({
      ...profile,
      parks_visited: visitStats.count,
      friend_count: friendCount.count,
      friendship_status,
      badges,
      visited_parks: visitedParks,
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}
