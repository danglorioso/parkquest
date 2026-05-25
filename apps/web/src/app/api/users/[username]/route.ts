import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, count, and, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { userProfiles, visits, follows, parks } from '@/lib/db/schema';

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

    const [[visitStats], [followerCount], [followingCount], recentVisits] = await Promise.all([
      db
        .select({ count: count() })
        .from(visits)
        .where(and(
          eq(visits.clerk_user_id, targetId),
          eq(visits.is_bucket_list, false),
          isNotNull(visits.visited_date),
        )),
      db.select({ count: count() }).from(follows).where(eq(follows.following_id, targetId)),
      db.select({ count: count() }).from(follows).where(eq(follows.follower_id, targetId)),
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

    const isFollowing = viewerId
      ? (await db
          .select()
          .from(follows)
          .where(and(eq(follows.follower_id, viewerId), eq(follows.following_id, targetId)))
          .limit(1)).length > 0
      : false;

    const isOwnProfile = viewerId === targetId;

    return NextResponse.json({
      ...profile,
      parks_visited: visitStats.count,
      follower_count: followerCount.count,
      following_count: followingCount.count,
      is_following: isFollowing,
      is_own_profile: isOwnProfile,
      recent_visits: recentVisits,
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}
