import type { BadgeColors, BadgeCondition, BadgeConditionType, BadgeTier } from '@parkquest/types';

const TIERS: BadgeTier[] = ['bronze', 'silver', 'gold', 'platinum', 'legendary'];

const NUMERIC_TYPES: BadgeConditionType[] = [
  'parks_visited', 'states_visited', 'bucket_list_count', 'total_visits',
  'visits_to_single_park', 'parks_in_year', 'visits_in_year',
];

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export interface BadgeInput {
  name: string;
  description: string;
  emoji: string;
  tier: BadgeTier;
  colors: BadgeColors | null;
  conditions: BadgeCondition[];
  enabled: boolean;
}

/** null/undefined = use tier colors. Returns a string describing what's wrong. */
export function validateColors(raw: unknown): BadgeColors | null | string {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object') return 'Invalid colors';
  const c = raw as Record<string, unknown>;
  if (typeof c.fill !== 'string' || !HEX_COLOR.test(c.fill)) return 'Colors need a hex fill like #B27339';
  if (typeof c.light !== 'string' || !HEX_COLOR.test(c.light)) return 'Colors need a hex light like #D4A070';
  return { fill: c.fill, light: c.light };
}

/** Validates a non-empty condition list. Returns a string describing what's wrong. */
export function validateConditions(raw: unknown): BadgeCondition[] | string {
  if (!Array.isArray(raw) || raw.length === 0) return 'At least one condition is required';
  const conditions: BadgeCondition[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) return 'Invalid condition';
    const c = item as Record<string, unknown>;
    const type = c.type as BadgeConditionType;

    if (NUMERIC_TYPES.includes(type)) {
      const count = Number(c.count);
      if (!Number.isInteger(count) || count < 1) return `Condition "${type}" needs a count of at least 1`;
      conditions.push({ type, count });
    } else if (type === 'all_parks_visited') {
      conditions.push({ type });
    } else if (type === 'specific_parks') {
      const parkCodes = Array.isArray(c.parkCodes)
        ? c.parkCodes.filter((p): p is string => typeof p === 'string' && p.length > 0)
        : [];
      if (parkCodes.length === 0) return 'Specific-parks condition needs at least one park';
      const mode = c.mode === 'any' ? 'any' : 'all';
      if (mode === 'any') {
        const count = Number(c.count);
        if (!Number.isInteger(count) || count < 1 || count > parkCodes.length) {
          return '"Any of" condition needs a count between 1 and the number of selected parks';
        }
        conditions.push({ type, parkCodes, mode, count });
      } else {
        conditions.push({ type, parkCodes, mode });
      }
    } else {
      return `Unknown condition type: ${String(c.type)}`;
    }
  }
  return conditions;
}

/** Returns a normalized payload, or a string describing what's wrong. */
export function validateBadge(body: unknown): BadgeInput | string {
  if (typeof body !== 'object' || body === null) return 'Invalid payload';
  const b = body as Record<string, unknown>;

  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!name || name.length > 100) return 'Name is required (max 100 chars)';

  const description = typeof b.description === 'string' ? b.description.trim() : '';
  if (!description) return 'Description is required';

  const emoji = typeof b.emoji === 'string' ? b.emoji.trim() : '';
  if (!emoji || emoji.length > 20) return 'Emoji is required';

  const tier = b.tier as BadgeTier;
  if (!TIERS.includes(tier)) return `Tier must be one of: ${TIERS.join(', ')}`;

  const colors = validateColors(b.colors);
  if (typeof colors === 'string') return colors;

  const conditions = validateConditions(b.conditions);
  if (typeof conditions === 'string') return conditions;

  return { name, description, emoji, tier, colors, conditions, enabled: b.enabled !== false };
}

/** 'Weekend Warrior' -> 'weekend_warrior' */
export function slugifyBadgeId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return slug || 'badge';
}
