import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, count, and, or, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { userProfiles, visits, friendships, parks } from '@/lib/db/schema';

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

    const [[visitStats], [friendCount], recentVisits] = await Promise.all([
      db
        .select({ count: count() })
        .from(visits)
        .where(and(
          eq(visits.clerk_user_id, targetId),
          eq(visits.is_bucket_list, false),
          isNotNull(visits.visited_date),
        )),
      db.select({ count: count() }).from(friendships).where(
        and(
          or(eq(friendships.requester_id, targetId), eq(friendships.recipient_id, targetId)),
          eq(friendships.status, 'accepted')
        )
      ),
      db
        .select({
          park_code: parks.park_code,
          name: parks.name,
          states: parks.states,
          visited_date: visits.visited_date,
        })
        .from(visits)
        .innerJoin(parks, eq(visits.park_code, parks.park_code))
        .where(and(
          eq(visits.clerk_user_id, targetId),
          eq(visits.is_bucket_list, false),
          isNotNull(visits.visited_date),
        ))
        .orderBy(sql`${visits.visited_date} desc nulls last`)
        .limit(6),
    ]);

    let friendship_status: 'none' | 'pending_sent' | 'pending_received' | 'accepted' = 'none';
    let friendship_id: number | null = null;
    if (viewerId && viewerId !== targetId) {
      const [existing] = await db
        .select()
        .from(friendships)
        .where(
          or(
            and(eq(friendships.requester_id, viewerId), eq(friendships.recipient_id, targetId)),
            and(eq(friendships.requester_id, targetId), eq(friendships.recipient_id, viewerId))
          )
        )
        .limit(1);

      if (existing) {
        friendship_id = existing.id;
        if (existing.status === 'accepted') {
          friendship_status = 'accepted';
        } else if (existing.status === 'pending') {
          friendship_status = existing.requester_id === viewerId ? 'pending_sent' : 'pending_received';
        }
      }
    }

    const isOwnProfile = viewerId === targetId;

    return NextResponse.json({
      ...profile,
      parks_visited: visitStats.count,
      friend_count: friendCount.count,
      friendship_status,
      friendship_id,
      is_own_profile: isOwnProfile,
      recent_visits: recentVisits,
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}
