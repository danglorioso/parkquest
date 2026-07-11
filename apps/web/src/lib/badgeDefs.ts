import { eq } from 'drizzle-orm';
import type { BadgeDef, BadgeTier } from '@parkquest/types';
import { db } from '@/lib/db';
import { customBadges, type CustomBadgeRow } from '@/lib/db/schema';
import { ALL_BADGES } from '@/lib/badges';

export function customBadgeToDef(b: CustomBadgeRow): BadgeDef {
  return {
    id: b.badge_id,
    name: b.name,
    description: b.description,
    emoji: b.emoji,
    tier: b.tier as BadgeTier,
  };
}

/** Enabled custom badges only — the set that gets evaluated and awarded. */
export function getEnabledCustomBadges(): Promise<CustomBadgeRow[]> {
  return db.select().from(customBadges).where(eq(customBadges.enabled, true));
}

/**
 * Display info for every badge id that may appear in user_badges or on badge
 * share posts: static definitions plus ALL custom badges (including disabled
 * ones, so existing posts/awards keep rendering after a badge is turned off).
 */
export async function getBadgeDisplayMap(): Promise<Map<string, BadgeDef>> {
  const custom = await db.select().from(customBadges);
  const map = new Map<string, BadgeDef>(
    ALL_BADGES.map(b => [b.id, { id: b.id, name: b.name, description: b.description, emoji: b.emoji, tier: b.tier }])
  );
  for (const b of custom) map.set(b.badge_id, customBadgeToDef(b));
  return map;
}
