import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, and, or, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { friendships, visits, userProfiles } from '@/lib/db/schema';

// GET /api/parks/:park_code/visitors — which of the current user's accepted
// friends have logged a (non-private) visit to this park. Powers the "N
// friends have visited" mutuals indicator on the park detail screen.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ park_code: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { park_code } = await params;

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

    const friendIds = friendRows.map(r => r.friend_id);
    if (friendIds.length === 0) return NextResponse.json({ friends: [], total: 0 });

    // Visits only — never bucket-list entries, never private (a private visit
    // shouldn't surface here any more than it would in the feed).
    const visitRows = await db
      .select({ clerk_user_id: visits.clerk_user_id })
      .from(visits)
      .where(
        and(
          eq(visits.park_code, park_code),
          inArray(visits.clerk_user_id, friendIds),
          isNotNull(visits.visited_date),
          eq(visits.is_bucket_list, false),
          ne(visits.visibility, 'private'),
        )
      );

    const visitorIds = [...new Set(visitRows.map(r => r.clerk_user_id))];
    if (visitorIds.length === 0) return NextResponse.json({ friends: [], total: 0 });

    const profiles = await db
      .select({
        clerk_user_id: userProfiles.clerk_user_id,
        username: userProfiles.username,
        display_name: userProfiles.display_name,
        avatar_url: userProfiles.avatar_url,
      })
      .from(userProfiles)
      .where(inArray(userProfiles.clerk_user_id, visitorIds));

    return NextResponse.json({
      // Only ever need a handful for the avatar stack — the total below still
      // reflects everyone, not just the ones with fetched profiles.
      friends: profiles.slice(0, 3),
      total: profiles.length,
    });
  } catch (error) {
    console.error('Error fetching park visitors:', error);
    return NextResponse.json({ error: 'Failed to fetch park visitors' }, { status: 500 });
  }
}
