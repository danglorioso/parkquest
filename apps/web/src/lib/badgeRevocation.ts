// Server-only: touches the DB, so this must stay out of any module a client
// component imports (see the warning atop badges.ts — that split is why this
// file exists separately).

import { eq, and, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { visits, parks, userBadges, posts } from '@/lib/db/schema';
import { getEnabledBadges } from '@/lib/badgeDefs';
import { computeStats, conditionsMet } from '@/lib/badges';

// Deleting/editing a visit can drop a user below a badge's condition (e.g. their
// only visit to a park backing a "5 trips to one park" badge) — badges only
// shrink from actions like this, they never newly qualify, so callers that
// mutate visits only need to check for revocation, not re-run the award side
// (that still happens lazily on the next GET /api/badges).
export async function revokeUnqualifiedBadges(userId: string): Promise<string[]> {
  const [userVisits, allParks, earnedBadges, badgeDefs] = await Promise.all([
    db
      .select({ park_code: visits.park_code, is_bucket_list: visits.is_bucket_list, visited_date: visits.visited_date })
      .from(visits)
      .where(eq(visits.clerk_user_id, userId)),
    db.select({
      park_code: parks.park_code, states: parks.states,
      is_national_park: parks.is_national_park, designation: parks.designation,
    }).from(parks),
    db.select({ badge_id: userBadges.badge_id }).from(userBadges).where(eq(userBadges.clerk_user_id, userId)),
    getEnabledBadges(),
  ]);

  const stats = computeStats(userVisits, allParks);
  const earnedIds = new Set(earnedBadges.map(b => b.badge_id));

  // Only ids with a live (enabled) definition are considered, so disabling a
  // badge never strips it from users who already earned it.
  const revokedIds = badgeDefs
    .filter(b => earnedIds.has(b.badge_id) && !conditionsMet(b.conditions, stats))
    .map(b => b.badge_id);

  if (revokedIds.length > 0) {
    await Promise.all([
      db.delete(userBadges).where(and(eq(userBadges.clerk_user_id, userId), inArray(userBadges.badge_id, revokedIds))),
      db.delete(posts).where(and(eq(posts.clerk_user_id, userId), inArray(posts.badge_id, revokedIds))),
    ]);
  }

  return revokedIds;
}
