import { NextResponse, after } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { visits, parks, userBadges, notifications } from '@/lib/db/schema';
import { computeStats, conditionsMet, conditionsProgress } from '@/lib/badges';
import { revokeUnqualifiedBadges } from '@/lib/badgeRevocation';
import { getEnabledBadges } from '@/lib/badgeDefs';
import { sendPushToUser } from '@/lib/push';

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const [userVisits, allParks, earnedBadges, badgeDefs] = await Promise.all([
      db
        .select({ park_code: visits.park_code, is_bucket_list: visits.is_bucket_list, visited_date: visits.visited_date })
        .from(visits)
        .where(eq(visits.clerk_user_id, userId)),
      db.select({
        park_code: parks.park_code, states: parks.states,
        is_national_park: parks.is_national_park, designation: parks.designation,
      }).from(parks),
      db
        .select({ badge_id: userBadges.badge_id, earned_at: userBadges.earned_at })
        .from(userBadges)
        .where(eq(userBadges.clerk_user_id, userId)),
      getEnabledBadges(),
    ]);

    const stats = computeStats(userVisits, allParks);
    const earnedIds = new Set(earnedBadges.map((b) => b.badge_id));
    const earnedMap = new Map(earnedBadges.map((b) => [b.badge_id, b.earned_at]));

    // Award any newly unlocked badges
    const newBadges = badgeDefs.filter((b) => !earnedIds.has(b.badge_id) && conditionsMet(b.conditions, stats));
    if (newBadges.length > 0) {
      await db
        .insert(userBadges)
        .values(newBadges.map((b) => ({ clerk_user_id: userId, badge_id: b.badge_id })))
        .onConflictDoNothing();
      newBadges.forEach((b) => {
        earnedIds.add(b.badge_id);
        earnedMap.set(b.badge_id, new Date());
      });
      // Notify user of each new badge
      await db.insert(notifications)
        .values(newBadges.map((b) => ({
          recipient_id: userId,
          actor_id: null,
          type: 'badge_earned' as const,
          metadata: { badge_id: b.badge_id, badge_name: b.name, badge_emoji: b.emoji },
        })))
        .catch(() => {});
      // Un-awaited work dies when the serverless response returns; after() keeps
      // the function alive until the push is actually handed to Expo.
      after(() =>
        Promise.all(newBadges.map((b) =>
          sendPushToUser(userId, {
            title: 'Badge earned!',
            body: `${b.emoji} ${b.name} — ${b.description}`,
            url: '/badges',
          }).catch(() => {})
        ))
      );
    }

    // Revoke badges the user no longer qualifies for, and delete their badge share posts.
    const revokedIds = await revokeUnqualifiedBadges(userId);
    revokedIds.forEach(id => {
      earnedIds.delete(id);
      earnedMap.delete(id);
    });

    const badgesWithStatus = badgeDefs.map((b) => {
      const p = conditionsProgress(b.conditions, stats);
      return {
        id: b.badge_id,
        name: b.name,
        description: b.description,
        emoji: b.emoji,
        tier: b.tier,
        colors: b.colors,
        earned: earnedIds.has(b.badge_id),
        earned_at: earnedMap.get(b.badge_id) ?? null,
        progress_current: p?.current ?? null,
        progress_target: p?.target ?? null,
      };
    });

    return NextResponse.json({ badges: badgesWithStatus, stats });
  } catch (error) {
    console.error('Error fetching badges:', error);
    return NextResponse.json({ error: 'Failed to fetch badges' }, { status: 500 });
  }
}
