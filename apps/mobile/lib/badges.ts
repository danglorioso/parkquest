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

// Badge display info lives entirely in the server DB (name/emoji/tier/colors
// are all admin-editable) — no static mirror here. ensureBadgeDefs() populates
// BADGE_MAP at runtime; callers re-read the map once the promise resolves.
export const BADGE_MAP = new Map<string, BadgeInfo>();

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
