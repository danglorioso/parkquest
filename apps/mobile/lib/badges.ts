export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'legendary';

export interface BadgeColors { fill: string; light: string }

export interface BadgeInfo {
  id: string;
  name: string;
  emoji: string;
  tier: BadgeTier;
  description: string;
  /** Admin-set colors; when absent the tier palette applies. */
  colors?: BadgeColors | null;
}

export const BADGE_TIER_COLORS: Record<BadgeTier, BadgeColors> = {
  bronze:    { fill: '#B27339', light: '#D4A070' },
  silver:    { fill: '#A8A39B', light: '#C5C0B8' },
  gold:      { fill: '#D4A93F', light: '#EBC96A' },
  platinum:  { fill: '#6E97A3', light: '#95B8C2' },
  legendary: { fill: '#8B5DBF', light: '#B08ADE' },
};

/** Effective colors for a badge: admin-set pair, else its tier's palette. */
export function badgeColors(b?: { tier?: string; colors?: BadgeColors | null } | null): BadgeColors {
  return b?.colors ?? BADGE_TIER_COLORS[(b?.tier ?? 'bronze') as BadgeTier] ?? BADGE_TIER_COLORS.bronze;
}

// Mirrors apps/web/src/lib/badges.ts — only the display fields needed by PostCard
const ALL_BADGES: BadgeInfo[] = [
  { id: 'first_steps',      name: 'First Steps',      emoji: '🌱',  tier: 'bronze',    description: 'Visited your very first national park' },
  { id: 'trail_walker',     name: 'Trail Walker',      emoji: '🥾',  tier: 'bronze',    description: 'Visited 5 national parks' },
  { id: 'camp_wanderer',    name: 'Camp Wanderer',     emoji: '🏕️', tier: 'silver',    description: 'Visited 10 national parks' },
  { id: 'sharp_eye',        name: 'Sharp Eye',         emoji: '🦅',  tier: 'silver',    description: 'Visited 25 national parks' },
  { id: 'true_explorer',    name: 'True Explorer',     emoji: '🗺️', tier: 'gold',      description: 'Visited 50 national parks' },
  { id: 'peak_climber',     name: 'Peak Climber',      emoji: '🏔️', tier: 'gold',      description: 'Visited 75 national parks' },
  { id: 'century_club',     name: 'Century Club',      emoji: '⭐',  tier: 'gold',      description: 'Visited 100 national parks' },
  { id: 'star_ranger',      name: 'Star Ranger',       emoji: '🌟',  tier: 'platinum',  description: 'Visited 150 national parks' },
  { id: 'horizon_chaser',   name: 'Horizon Chaser',    emoji: '🌄',  tier: 'platinum',  description: 'Visited 200 national parks' },
  { id: 'wild_at_heart',    name: 'Wild At Heart',     emoji: '🦁',  tier: 'legendary', description: 'Visited 300 national parks' },
  { id: 'park_legend',      name: 'Park Legend',       emoji: '👑',  tier: 'legendary', description: 'Visited every single national park' },
  { id: 'state_hopper',     name: 'State Hopper',      emoji: '🧭',  tier: 'bronze',    description: 'Visited parks in 3 different states' },
  { id: 'cross_country',    name: 'Cross Country',     emoji: '🌎',  tier: 'silver',    description: 'Visited parks in 7 different states' },
  { id: 'all_american',     name: 'All-American',      emoji: '🗽',  tier: 'gold',      description: 'Visited parks in 15 different states' },
  { id: 'continental',      name: 'Continental',       emoji: '🌐',  tier: 'platinum',  description: 'Visited parks in 30 different states' },
  { id: 'united_legend',    name: 'United Legend',     emoji: '🏛️', tier: 'legendary', description: 'Visited parks in all 50 states' },
  { id: 'wishful_thinker',  name: 'Wishful Thinker',   emoji: '📋',  tier: 'bronze',    description: 'Added 5 parks to your bucket list' },
  { id: 'big_dreamer',      name: 'Big Dreamer',       emoji: '✨',  tier: 'silver',    description: 'Added 15 parks to your bucket list' },
  { id: 'visionary',        name: 'Visionary',         emoji: '🌠',  tier: 'gold',      description: 'Added 30 parks to your bucket list' },
  { id: 'hot_streak',       name: 'Hot Streak',        emoji: '🔥',  tier: 'silver',    description: 'Visited 5 parks in a single calendar year' },
  { id: 'year_adventurer',  name: 'Year Adventurer',   emoji: '🚀',  tier: 'gold',      description: 'Visited 10 parks in a single calendar year' },
  { id: 'park_obsessed',    name: 'Park Obsessed',     emoji: '💫',  tier: 'platinum',  description: 'Visited 20 parks in a single calendar year' },
];

export const BADGE_MAP = new Map<string, BadgeInfo>(ALL_BADGES.map(b => [b.id, b]));

// ── Admin-defined badges ──────────────────────────────────────────────────────
// Custom badges live in the server DB, so they can't be mirrored statically.
// ensureBadgeDefs() merges them into BADGE_MAP at runtime; callers re-read the
// map once the promise resolves.

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

let hydrating: Promise<void> | null = null;

export function ensureBadgeDefs(): Promise<void> {
  hydrating ??= fetch(`${BASE}/api/badges/defs`)
    .then(r => r.json())
    .then((d: { badges?: BadgeInfo[] }) => {
      for (const b of d.badges ?? []) BADGE_MAP.set(b.id, b);
    })
    .catch(() => { hydrating = null; }); // allow a retry on next call
  return hydrating;
}
