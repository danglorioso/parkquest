export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'legendary';

export interface BadgeInfo {
  id: string;
  name: string;
  emoji: string;
  tier: BadgeTier;
}

export const BADGE_TIER_COLORS: Record<BadgeTier, { fill: string; light: string }> = {
  bronze:    { fill: '#B27339', light: '#D4A070' },
  silver:    { fill: '#A8A39B', light: '#C5C0B8' },
  gold:      { fill: '#D4A93F', light: '#EBC96A' },
  platinum:  { fill: '#6E97A3', light: '#95B8C2' },
  legendary: { fill: '#8B5DBF', light: '#B08ADE' },
};

// Mirrors apps/web/src/lib/badges.ts — only the display fields needed by PostCard
const ALL_BADGES: BadgeInfo[] = [
  { id: 'first_steps',      name: 'First Steps',      emoji: '🌱',  tier: 'bronze' },
  { id: 'trail_walker',     name: 'Trail Walker',      emoji: '🥾',  tier: 'bronze' },
  { id: 'camp_wanderer',    name: 'Camp Wanderer',     emoji: '🏕️', tier: 'silver' },
  { id: 'sharp_eye',        name: 'Sharp Eye',         emoji: '🦅',  tier: 'silver' },
  { id: 'true_explorer',    name: 'True Explorer',     emoji: '🗺️', tier: 'gold' },
  { id: 'peak_climber',     name: 'Peak Climber',      emoji: '🏔️', tier: 'gold' },
  { id: 'century_club',     name: 'Century Club',      emoji: '⭐',  tier: 'gold' },
  { id: 'star_ranger',      name: 'Star Ranger',       emoji: '🌟',  tier: 'platinum' },
  { id: 'horizon_chaser',   name: 'Horizon Chaser',    emoji: '🌄',  tier: 'platinum' },
  { id: 'wild_at_heart',    name: 'Wild At Heart',     emoji: '🦁',  tier: 'legendary' },
  { id: 'park_legend',      name: 'Park Legend',       emoji: '👑',  tier: 'legendary' },
  { id: 'state_hopper',     name: 'State Hopper',      emoji: '🧭',  tier: 'bronze' },
  { id: 'cross_country',    name: 'Cross Country',     emoji: '🌎',  tier: 'silver' },
  { id: 'all_american',     name: 'All-American',      emoji: '🗽',  tier: 'gold' },
  { id: 'continental',      name: 'Continental',       emoji: '🌐',  tier: 'platinum' },
  { id: 'united_legend',    name: 'United Legend',     emoji: '🏛️', tier: 'legendary' },
  { id: 'wishful_thinker',  name: 'Wishful Thinker',   emoji: '📋',  tier: 'bronze' },
  { id: 'big_dreamer',      name: 'Big Dreamer',       emoji: '✨',  tier: 'silver' },
  { id: 'visionary',        name: 'Visionary',         emoji: '🌠',  tier: 'gold' },
  { id: 'hot_streak',       name: 'Hot Streak',        emoji: '🔥',  tier: 'silver' },
  { id: 'year_adventurer',  name: 'Year Adventurer',   emoji: '🚀',  tier: 'gold' },
  { id: 'park_obsessed',    name: 'Park Obsessed',     emoji: '💫',  tier: 'platinum' },
];

export const BADGE_MAP = new Map<string, BadgeInfo>(ALL_BADGES.map(b => [b.id, b]));
