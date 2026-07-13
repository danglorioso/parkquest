import { eq } from 'drizzle-orm';
import type { BadgeDef, BadgeTier } from '@parkquest/types';
import { db } from '@/lib/db';
import { customBadges, type CustomBadgeRow } from '@/lib/db/schema';

export function badgeToDef(b: CustomBadgeRow): BadgeDef {
  return {
    id: b.badge_id,
    name: b.name,
    description: b.description,
    emoji: b.emoji,
    tier: b.tier as BadgeTier,
    colors: b.colors ?? null,
  };
}

/** Enabled badges only — the set that gets evaluated and awarded. */
export function getEnabledBadges(): Promise<CustomBadgeRow[]> {
  return db.select().from(customBadges).where(eq(customBadges.enabled, true));
}

/**
 * Display info for every badge id that may appear in user_badges or on badge
 * share posts, including disabled ones so existing awards/posts keep
 * rendering after a badge is turned off.
 */
export async function getBadgeDisplayMap(): Promise<Map<string, BadgeDef>> {
  const rows = await db.select().from(customBadges);
  return new Map(rows.map(b => [b.badge_id, badgeToDef(b)]));
}
