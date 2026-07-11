import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, and, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { visits, parks, userBadges, posts, notifications } from '@/lib/db/schema';
import {
  ALL_BADGES, computeStats, conditionsMet, conditionsProgress,
  type BadgeDefinition, type UserStats, type BadgeTier,
} from '@/lib/badges';
import { getEnabledCustomBadges } from '@/lib/badgeDefs';

// Static + custom badges evaluated through one shape
interface EvalBadge {
  id: string;
  name: string;
  description: string;
  emoji: string;
  tier: BadgeTier;
  earns: (stats: UserStats) => boolean;
  progress: (stats: UserStats) => { current: number | null; target: number | null };
}

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const [userVisits, allParks, earnedBadges, customRows] = await Promise.all([
      db
        .select({ park_code: visits.park_code, is_bucket_list: visits.is_bucket_list, visited_date: visits.visited_date })
        .from(visits)
        .where(eq(visits.clerk_user_id, userId)),
      db.select({ park_code: parks.park_code, states: parks.states }).from(parks),
      db
        .select({ badge_id: userBadges.badge_id, earned_at: userBadges.earned_at })
        .from(userBadges)
        .where(eq(userBadges.clerk_user_id, userId)),
      getEnabledCustomBadges(),
    ]);

    const stats = computeStats(userVisits, allParks);
    const earnedIds = new Set(earnedBadges.map((b) => b.badge_id));
    const earnedMap = new Map(earnedBadges.map((b) => [b.badge_id, b.earned_at]));

    const evalBadges: EvalBadge[] = [
      ...ALL_BADGES.map((b: BadgeDefinition): EvalBadge => ({
        id: b.id,
        name: b.name,
        description: b.description,
        emoji: b.emoji,
        tier: b.tier,
        earns: (s) => b.criteria(s),
        progress: (s) => ({ current: b.progressCurrent?.(s) ?? null, target: b.progressTarget?.(s) ?? null }),
      })),
      ...customRows.map((b): EvalBadge => ({
        id: b.badge_id,
        name: b.name,
        description: b.description,
        emoji: b.emoji,
        tier: b.tier as BadgeTier,
        earns: (s) => conditionsMet(b.conditions, s),
        progress: (s) => {
          const p = conditionsProgress(b.conditions, s);
          return { current: p?.current ?? null, target: p?.target ?? null };
        },
      })),
    ];

    // Award any newly unlocked badges
    const newBadges = evalBadges.filter((badge) => !earnedIds.has(badge.id) && badge.earns(stats));
    if (newBadges.length > 0) {
      await db
        .insert(userBadges)
        .values(newBadges.map((b) => ({ clerk_user_id: userId, badge_id: b.id })))
        .onConflictDoNothing();
      newBadges.forEach((b) => {
        earnedIds.add(b.id);
        earnedMap.set(b.id, new Date());
      });
      // Notify user of each new badge (fire and forget)
      db.insert(notifications)
        .values(newBadges.map((b) => ({
          recipient_id: userId,
          actor_id: null,
          type: 'badge_earned' as const,
          metadata: { badge_id: b.id, badge_name: b.name, badge_emoji: b.emoji },
        })))
        .catch(() => {});
    }

    // Revoke badges the user no longer qualifies for, and delete their badge share posts.
    // Only ids with a live definition are considered, so disabling a custom badge
    // never strips it from users who already earned it.
    const revokedIds = evalBadges
      .filter((badge) => earnedIds.has(badge.id) && !badge.earns(stats))
      .map((b) => b.id);
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

    const badgesWithStatus = evalBadges.map((badge) => {
      const p = badge.progress(stats);
      return {
        id: badge.id,
        name: badge.name,
        description: badge.description,
        emoji: badge.emoji,
        tier: badge.tier,
        earned: earnedIds.has(badge.id),
        earned_at: earnedMap.get(badge.id) ?? null,
        progress_current: p.current,
        progress_target: p.target,
      };
    });

    return NextResponse.json({ badges: badgesWithStatus, stats });
  } catch (error) {
    console.error('Error fetching badges:', error);
    return NextResponse.json({ error: 'Failed to fetch badges' }, { status: 500 });
  }
}
