import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, desc, and, or, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { visits, userBadges, posts, friendships, parks, userProfiles } from '@/lib/db/schema';
import { ALL_BADGES } from '@/lib/badges';

const BADGE_MAP = new Map(ALL_BADGES.map((b) => [b.id, { name: b.name, emoji: b.emoji }]));

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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

    const friendIds = friendRows.map((r) => r.friend_id);
    if (friendIds.length === 0) return NextResponse.json([]);

    const [recentVisits, recentBuckets, recentBadges, recentPosts] = await Promise.all([
      db
        .select({
          user_id: visits.clerk_user_id,
          username: userProfiles.username,
          display_name: userProfiles.display_name,
          avatar_url: userProfiles.avatar_url,
          park_name: parks.name,
          created_at: visits.created_at,
        })
        .from(visits)
        .leftJoin(userProfiles, eq(visits.clerk_user_id, userProfiles.clerk_user_id))
        .leftJoin(parks, eq(visits.park_code, parks.park_code))
        .where(
          and(
            inArray(visits.clerk_user_id, friendIds),
            eq(visits.is_bucket_list, false),
            isNotNull(visits.visited_date),
            ne(visits.visibility, 'private')
          )
        )
        .orderBy(desc(visits.created_at))
        .limit(15),

      db
        .select({
          user_id: visits.clerk_user_id,
          username: userProfiles.username,
          display_name: userProfiles.display_name,
          avatar_url: userProfiles.avatar_url,
          park_name: parks.name,
          created_at: visits.created_at,
        })
        .from(visits)
        .leftJoin(userProfiles, eq(visits.clerk_user_id, userProfiles.clerk_user_id))
        .leftJoin(parks, eq(visits.park_code, parks.park_code))
        .where(
          and(
            inArray(visits.clerk_user_id, friendIds),
            eq(visits.is_bucket_list, true),
            ne(visits.visibility, 'private')
          )
        )
        .orderBy(desc(visits.created_at))
        .limit(10),

      db
        .select({
          user_id: userBadges.clerk_user_id,
          username: userProfiles.username,
          display_name: userProfiles.display_name,
          avatar_url: userProfiles.avatar_url,
          badge_id: userBadges.badge_id,
          created_at: userBadges.earned_at,
        })
        .from(userBadges)
        .leftJoin(userProfiles, eq(userBadges.clerk_user_id, userProfiles.clerk_user_id))
        .where(inArray(userBadges.clerk_user_id, friendIds))
        .orderBy(desc(userBadges.earned_at))
        .limit(15),

      db
        .select({
          user_id: posts.clerk_user_id,
          username: userProfiles.username,
          display_name: userProfiles.display_name,
          avatar_url: userProfiles.avatar_url,
          park_name: parks.name,
          created_at: posts.created_at,
        })
        .from(posts)
        .leftJoin(userProfiles, eq(posts.clerk_user_id, userProfiles.clerk_user_id))
        .leftJoin(parks, eq(posts.park_code, parks.park_code))
        .leftJoin(visits, eq(posts.visit_id, visits.id))
        .where(and(
          inArray(posts.clerk_user_id, friendIds),
          sql`COALESCE(${visits.visibility}, ${posts.visibility}, 'public') != 'private'`
        ))
        .orderBy(desc(posts.created_at))
        .limit(10),
    ]);

    type BaseEvent = {
      user_id: string;
      username: string | null;
      display_name: string | null;
      avatar_url: string | null;
      created_at: Date | null;
    };
    type ActivityEvent =
      | (BaseEvent & { type: 'visit' | 'bucket' | 'post'; park_name: string | null })
      | (BaseEvent & { type: 'badge'; badge_id: string; badge_name: string; badge_emoji: string });

    const items: ActivityEvent[] = [
      ...recentVisits.map((v) => ({ type: 'visit' as const, ...v })),
      ...recentBuckets.map((v) => ({ type: 'bucket' as const, ...v })),
      ...recentBadges.map((b) => ({
        type: 'badge' as const,
        user_id: b.user_id,
        username: b.username,
        display_name: b.display_name,
        avatar_url: b.avatar_url,
        badge_id: b.badge_id,
        badge_name: BADGE_MAP.get(b.badge_id)?.name ?? b.badge_id,
        badge_emoji: BADGE_MAP.get(b.badge_id)?.emoji ?? '🏅',
        created_at: b.created_at,
      })),
      ...recentPosts.map((p) => ({ type: 'post' as const, ...p })),
    ];

    items.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });

    return NextResponse.json(items.slice(0, 25));
  } catch (error) {
    console.error('Error fetching activity:', error);
    return NextResponse.json({ error: 'Failed to fetch activity' }, { status: 500 });
  }
}
