import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { userBadges } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/admin';
import { ALL_BADGES, BUILTIN_CONDITIONS } from '@/lib/badges';
import { getBadgeOverrides } from '@/lib/badgeDefs';

// GET /api/admin/builtin-badges — every built-in badge with its default
// definition, any admin override, and earned counts. The admin UI edits these
// through PUT/DELETE /api/admin/builtin-badges/[badgeId].
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const [overrides, counts] = await Promise.all([
    getBadgeOverrides(),
    db.select({ badge_id: userBadges.badge_id, count: sql<number>`COUNT(*)::int` })
      .from(userBadges).groupBy(userBadges.badge_id),
  ]);
  const overrideMap = new Map(overrides.map(o => [o.badge_id, o]));
  const countMap = new Map(counts.map(c => [c.badge_id, c.count]));

  return NextResponse.json({
    badges: ALL_BADGES.map(b => {
      const o = overrideMap.get(b.id);
      return {
        badge_id: b.id,
        name: o?.name ?? b.name,
        description: o?.description ?? b.description,
        emoji: o?.emoji ?? b.emoji,
        tier: o?.tier ?? b.tier,
        colors: o?.colors ?? null,
        conditions: o?.conditions ?? null,
        overridden: !!o,
        default_name: b.name,
        default_description: b.description,
        default_emoji: b.emoji,
        default_tier: b.tier,
        // Condition-engine equivalent of the code rule, for prefilling the
        // criteria editor. null = not expressible (park_legend).
        builtin_conditions: BUILTIN_CONDITIONS[b.id] ?? null,
        earned_count: countMap.get(b.id) ?? 0,
      };
    }),
  });
}
