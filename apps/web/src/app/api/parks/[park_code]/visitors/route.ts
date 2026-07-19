import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, and, or, inArray, notInArray, isNotNull, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { friendships, visits, posts, userProfiles } from '@/lib/db/schema';
import { getBlockedIds } from '@/lib/blocks';

const profileFields = {
  clerk_user_id: userProfiles.clerk_user_id,
  username: userProfiles.username,
  display_name: userProfiles.display_name,
  avatar_url: userProfiles.avatar_url,
};

// GET /api/parks/:park_code/visitors — who's visited this park, split into the
// current user's accepted friends (non-private visits) and everyone else with a
// publicly visible post from the park. Powers the "N friends and M others have
// visited" indicator on the park detail screen.
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

    // Visits only — never bucket-list entries, never private (a private visit
    // shouldn't surface here any more than it would in the feed).
    let friendProfiles: Array<{
      clerk_user_id: string;
      username: string;
      display_name: string | null;
      avatar_url: string | null;
    }> = [];
    if (friendIds.length > 0) {
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
      if (visitorIds.length > 0) {
        friendProfiles = await db
          .select(profileFields)
          .from(userProfiles)
          .where(inArray(userProfiles.clerk_user_id, visitorIds));
      }
    }

    // Everyone else: users with a publicly visible post from this park (visit
    // posts inherit the linked visit's visibility — the visit is the source of
    // truth). Friends are excluded so nobody appears in both buckets, and
    // blocked users (either direction) never surface.
    const blockedIds = await getBlockedIds(userId);
    const excludedIds = [userId, ...friendIds, ...blockedIds];

    const otherRows = await db
      .selectDistinct({ clerk_user_id: posts.clerk_user_id })
      .from(posts)
      .leftJoin(visits, eq(posts.visit_id, visits.id))
      .where(
        and(
          eq(posts.park_code, park_code),
          sql`COALESCE(${visits.visibility}, ${posts.visibility}, 'public') = 'public'`,
          notInArray(posts.clerk_user_id, excludedIds),
        )
      );

    // Inner join against user_profiles doubles as the deleted-user filter —
    // a poster with no profile row simply doesn't appear.
    const otherIds = otherRows.map(r => r.clerk_user_id);
    const otherProfiles = otherIds.length > 0
      ? await db
          .select(profileFields)
          .from(userProfiles)
          .where(inArray(userProfiles.clerk_user_id, otherIds))
      : [];

    // Full lists — the mobile client slices to a few for the avatar stack
    // (friends first) but needs everyone for the tap-through sheet.
    return NextResponse.json({
      friends: friendProfiles,
      total: friendProfiles.length,
      others: otherProfiles,
      others_total: otherProfiles.length,
    });
  } catch (error) {
    console.error('Error fetching park visitors:', error);
    return NextResponse.json({ error: 'Failed to fetch park visitors' }, { status: 500 });
  }
}
