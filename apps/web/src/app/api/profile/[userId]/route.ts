import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, count, and, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { userProfiles, visits, friendships } from '@/lib/db/schema';

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

    const [[visitStats], [friendCount]] = await Promise.all([
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

    return NextResponse.json({
      ...profile,
      parks_visited: visitStats.count,
      friend_count: friendCount.count,
      friendship_status,
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}
