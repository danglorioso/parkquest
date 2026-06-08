import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, and, or, ne, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { friendships, userProfiles, visits } from '@/lib/db/schema';

const W_MUTUAL_FRIEND  = 3;
const W_SHARED_PARK    = 2;

export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const SUGGESTION_COUNT = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '4', 10), 1), 20);

    // ── Step 1: all existing relationships ───────────────────────────────────
    const myRelationships = await db
      .select({
        other_id: sql<string>`CASE WHEN ${friendships.requester_id} = ${userId}
          THEN ${friendships.recipient_id}
          ELSE ${friendships.requester_id} END`,
        status: friendships.status,
      })
      .from(friendships)
      .where(or(eq(friendships.requester_id, userId), eq(friendships.recipient_id, userId)));

    const myFriendIds  = myRelationships.filter(r => r.status === 'accepted').map(r => r.other_id);
    const excludeIds   = new Set([userId, ...myRelationships.map(r => r.other_id)]);
    const myFriendSet  = new Set(myFriendIds);

    const scores = new Map<string, { mutual_friends: number; shared_parks: number }>();

    // ── Step 2: friends of friends ───────────────────────────────────────────
    if (myFriendIds.length > 0) {
      const fofRows = await db
        .select({ requester_id: friendships.requester_id, recipient_id: friendships.recipient_id })
        .from(friendships)
        .where(
          and(
            or(inArray(friendships.requester_id, myFriendIds), inArray(friendships.recipient_id, myFriendIds)),
            eq(friendships.status, 'accepted'),
          ),
        );

      for (const { requester_id, recipient_id } of fofRows) {
        // The candidate is whichever side is NOT already my friend
        const candidates: string[] = [];
        if (!myFriendSet.has(requester_id) && !excludeIds.has(requester_id)) candidates.push(requester_id);
        if (!myFriendSet.has(recipient_id) && !excludeIds.has(recipient_id)) candidates.push(recipient_id);
        for (const id of candidates) {
          const e = scores.get(id) ?? { mutual_friends: 0, shared_parks: 0 };
          e.mutual_friends += 1;
          scores.set(id, e);
        }
      }
    }

    // ── Step 3: users who visited the same parks ─────────────────────────────
    const myParkRows = await db
      .select({ park_code: visits.park_code })
      .from(visits)
      .where(
        and(
          eq(visits.clerk_user_id, userId),
          isNotNull(visits.visited_date),
          eq(visits.is_bucket_list, false),
        ),
      );

    const myParkCodes = [...new Set(myParkRows.map(v => v.park_code).filter(Boolean))] as string[];

    if (myParkCodes.length > 0) {
      const sharedRows = await db
        .select({ clerk_user_id: visits.clerk_user_id })
        .from(visits)
        .where(
          and(
            inArray(visits.park_code, myParkCodes),
            ne(visits.clerk_user_id, userId),
            isNotNull(visits.visited_date),
            eq(visits.is_bucket_list, false),
          ),
        );

      for (const { clerk_user_id } of sharedRows) {
        if (!excludeIds.has(clerk_user_id)) {
          const e = scores.get(clerk_user_id) ?? { mutual_friends: 0, shared_parks: 0 };
          e.shared_parks += 1;
          scores.set(clerk_user_id, e);
        }
      }
    }

    // ── Step 4: rank scored candidates ──────────────────────────────────────
    // Fetch a 2x buffer so profile-less candidates don't shrink the final count
    const FETCH_COUNT = SUGGESTION_COUNT * 2;

    const ranked = [...scores.entries()]
      .map(([id, { mutual_friends, shared_parks }]) => ({
        clerk_user_id: id,
        mutual_friends,
        shared_parks,
        score: mutual_friends * W_MUTUAL_FRIEND + shared_parks * W_SHARED_PARK,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, FETCH_COUNT);

    // ── Step 5: fill up to FETCH_COUNT with most-active explorers ───────────
    const needed = FETCH_COUNT - ranked.length;
    if (needed > 0) {
      const alreadyIncluded = new Set([...excludeIds, ...ranked.map(r => r.clerk_user_id)]);
      const excludeList = [...alreadyIncluded];
      // Inner-join with userProfiles so every fill result is guaranteed to have a profile
      const activeUsers = await db
        .select({ clerk_user_id: userProfiles.clerk_user_id })
        .from(userProfiles)
        .innerJoin(visits, eq(visits.clerk_user_id, userProfiles.clerk_user_id))
        .where(
          and(
            isNotNull(visits.visited_date),
            eq(visits.is_bucket_list, false),
            ...(excludeList.length > 0
              ? [sql`${userProfiles.clerk_user_id} != ALL(${sql.raw(`ARRAY[${excludeList.map(id => `'${id}'`).join(',')}]::text[]`)})`]
              : []),
          ),
        )
        .groupBy(userProfiles.clerk_user_id)
        .orderBy(sql`count(*) desc`)
        .limit(needed);

      for (const { clerk_user_id } of activeUsers) {
        ranked.push({ clerk_user_id, mutual_friends: 0, shared_parks: 0, score: 0 });
      }
    }

    if (ranked.length === 0) return NextResponse.json([]);

    const candidateIds = ranked.map(r => r.clerk_user_id);

    // ── Step 6: fetch profiles + visit counts in parallel ────────────────────
    const [profiles, visitCounts] = await Promise.all([
      db
        .select({
          clerk_user_id: userProfiles.clerk_user_id,
          username: userProfiles.username,
          display_name: userProfiles.display_name,
          avatar_url: userProfiles.avatar_url,
        })
        .from(userProfiles)
        .where(inArray(userProfiles.clerk_user_id, candidateIds)),
      db
        .select({
          clerk_user_id: visits.clerk_user_id,
          visit_count: sql<number>`count(*)::int`,
        })
        .from(visits)
        .where(
          and(
            inArray(visits.clerk_user_id, candidateIds),
            isNotNull(visits.visited_date),
            eq(visits.is_bucket_list, false),
          ),
        )
        .groupBy(visits.clerk_user_id),
    ]);

    const profileMap    = new Map(profiles.map(p => [p.clerk_user_id, p]));
    const visitCountMap = new Map(visitCounts.map(v => [v.clerk_user_id, v.visit_count]));

    const result = ranked
      .map(r => {
        const profile = profileMap.get(r.clerk_user_id);
        if (!profile) return null;
        return {
          ...profile,
          mutual_friends: r.mutual_friends,
          shared_parks: r.shared_parks,
          visit_count: visitCountMap.get(r.clerk_user_id) ?? 0,
        };
      })
      .filter(Boolean)
      .slice(0, SUGGESTION_COUNT);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching user suggestions:', error);
    return NextResponse.json({ error: 'Failed to fetch suggestions' }, { status: 500 });
  }
}
