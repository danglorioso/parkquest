import { eq } from 'drizzle-orm';
import type { BadgeColors, BadgeCondition, BadgeDef, BadgeTier } from '@parkquest/types';
import { db } from '@/lib/db';
import {
  badgeOverrides, customBadges,
  type BadgeOverrideRow, type CustomBadgeRow,
} from '@/lib/db/schema';
import { ALL_BADGES, type BadgeDefinition } from '@/lib/badges';

export function customBadgeToDef(b: CustomBadgeRow): BadgeDef {
  return {
    id: b.badge_id,
    name: b.name,
    description: b.description,
    emoji: b.emoji,
    tier: b.tier as BadgeTier,
    colors: b.colors ?? null,
  };
}

/** Enabled custom badges only — the set that gets evaluated and awarded. */
export function getEnabledCustomBadges(): Promise<CustomBadgeRow[]> {
  return db.select().from(customBadges).where(eq(customBadges.enabled, true));
}

export function getBadgeOverrides(): Promise<BadgeOverrideRow[]> {
  return db.select().from(badgeOverrides);
}

/** A built-in badge with any admin override applied. */
export interface EffectiveStaticBadge extends BadgeDefinition {
  colors: BadgeColors | null;
  /** Non-null when an admin replaced the code-defined criteria; evaluate these
   *  through the condition engine instead of `criteria`/`progress*`. */
  conditionOverride: BadgeCondition[] | null;
}

export function applyOverrides(overrides: BadgeOverrideRow[]): EffectiveStaticBadge[] {
  const byId = new Map(overrides.map(o => [o.badge_id, o]));
  return ALL_BADGES.map(b => {
    const o = byId.get(b.id);
    return {
      ...b,
      name: o?.name ?? b.name,
      description: o?.description ?? b.description,
      emoji: o?.emoji ?? b.emoji,
      tier: (o?.tier as BadgeTier | null) ?? b.tier,
      colors: o?.colors ?? null,
      conditionOverride: o?.conditions ?? null,
    };
  });
}

/** Built-in badges with admin overrides applied (fetches overrides itself). */
export async function getEffectiveStaticBadges(): Promise<EffectiveStaticBadge[]> {
  return applyOverrides(await getBadgeOverrides());
}

/**
 * Display info for every badge id that may appear in user_badges or on badge
 * share posts: built-in definitions (with admin overrides applied) plus ALL
 * custom badges (including disabled ones, so existing posts/awards keep
 * rendering after a badge is turned off).
 */
export async function getBadgeDisplayMap(): Promise<Map<string, BadgeDef>> {
  const [statics, custom] = await Promise.all([
    getEffectiveStaticBadges(),
    db.select().from(customBadges),
  ]);
  const map = new Map<string, BadgeDef>(
    statics.map(b => [b.id, { id: b.id, name: b.name, description: b.description, emoji: b.emoji, tier: b.tier, colors: b.colors }])
  );
  for (const b of custom) map.set(b.badge_id, customBadgeToDef(b));
  return map;
}
