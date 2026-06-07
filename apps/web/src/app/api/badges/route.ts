import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, and, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { visits, parks, userBadges, posts } from '@/lib/db/schema';
import { ALL_BADGES, computeStats, type BadgeDefinition } from '@/lib/badges';

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const [userVisits, allParks, earnedBadges] = await Promise.all([
      db
        .select({ park_code: visits.park_code, is_bucket_list: visits.is_bucket_list, visited_date: visits.visited_date })
        .from(visits)
        .where(eq(visits.clerk_user_id, userId)),
      db.select({ park_code: parks.park_code, states: parks.states }).from(parks),
      db
        .select({ badge_id: userBadges.badge_id, earned_at: userBadges.earned_at })
        .from(userBadges)
        .where(eq(userBadges.clerk_user_id, userId)),
    ]);

    const stats = computeStats(userVisits, allParks);
    const earnedIds = new Set(earnedBadges.map((b) => b.badge_id));
    const earnedMap = new Map(earnedBadges.map((b) => [b.badge_id, b.earned_at]));

    // Award any newly unlocked badges
    const newBadges = ALL_BADGES.filter(
      (badge: BadgeDefinition) => !earnedIds.has(badge.id) && badge.criteria(stats)
    );
    if (newBadges.length > 0) {
      await db
        .insert(userBadges)
        .values(newBadges.map((b: BadgeDefinition) => ({ clerk_user_id: userId, badge_id: b.id })))
        .onConflictDoNothing();
      newBadges.forEach((b: BadgeDefinition) => {
        earnedIds.add(b.id);
        earnedMap.set(b.id, new Date());
      });
    }

    // Revoke badges the user no longer qualifies for, and delete their badge share posts
    const revokedIds = ALL_BADGES
      .filter((badge: BadgeDefinition) => earnedIds.has(badge.id) && !badge.criteria(stats))
      .map((b: BadgeDefinition) => b.id);
    if (revokedIds.length > 0) {
      await Promise.all([
        db.delete(userBadges).where(and(eq(userBadges.clerk_user_id, userId), inArray(userBadges.badge_id, revokedIds))),
        db.delete(posts).where(and(eq(posts.clerk_user_id, userId), inArray(posts.badge_id, revokedIds))),
      ]);
      revokedIds.forEach(id => {
        earnedIds.delete(id);
        earnedMap.delete(id);
      });
    }

    const badgesWithStatus = ALL_BADGES.map((badge: BadgeDefinition) => ({
      id: badge.id,
      name: badge.name,
      description: badge.description,
      emoji: badge.emoji,
      tier: badge.tier,
      earned: earnedIds.has(badge.id),
      earned_at: earnedMap.get(badge.id) ?? null,
      progress_current: badge.progressCurrent?.(stats) ?? null,
      progress_target: badge.progressTarget?.(stats) ?? null,
    }));

    return NextResponse.json({ badges: badgesWithStatus, stats });
  } catch (error) {
    console.error('Error fetching badges:', error);
    return NextResponse.json({ error: 'Failed to fetch badges' }, { status: 500 });
  }
}
