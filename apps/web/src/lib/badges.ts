// ─── Badge system ─────────────────────────────────────────────────────────────
// Every badge — the original launch set and anything an admin adds later — is a
// row in the custom_badges table, evaluated through the condition engine below.
// There's no code-defined badge list; add/edit/delete all happen through
// /api/admin/badges.

import type { BadgeCondition } from '@parkquest/types';

export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'legendary';

export interface UserStats {
  parksVisited: number;
  totalParks: number;
  statesVisited: number;
  bucketListCount: number;
  parksThisYear: number;
  maxParksInAYear: number;
  // Extended stats for admin-defined badge conditions
  totalVisits: number;             // all visit logs (trips), repeat parks counted
  maxVisitsToOnePark: number;      // most trips logged to any single park
  maxVisitsInAYear: number;        // most visit logs in one calendar year
  maxUniqueParksInAYear: number;   // most distinct parks visited in one calendar year
  visitedParkCodes: string[];      // distinct parks visited
}

// ─── Tier visual config ────────────────────────────────────────────────────────

export const TIER_CONFIG: Record<BadgeTier, {
  gradient: string;
  cssGradient: string;
  shadow: string;
  ring: string;
  label: string;
  labelColor: string;
}> = {
  bronze: {
    gradient: 'from-amber-700 via-orange-500 to-amber-600',
    cssGradient: 'linear-gradient(135deg, #b45309, #f97316, #d97706)',
    shadow: 'shadow-amber-500/60',
    ring: 'ring-amber-400/40',
    label: 'Bronze',
    labelColor: 'text-amber-700',
  },
  silver: {
    gradient: 'from-slate-500 via-gray-300 to-slate-400',
    cssGradient: 'linear-gradient(135deg, #64748b, #d1d5db, #94a3b8)',
    shadow: 'shadow-slate-400/60',
    ring: 'ring-slate-300/40',
    label: 'Silver',
    labelColor: 'text-slate-500',
  },
  gold: {
    gradient: 'from-yellow-500 via-amber-300 to-yellow-500',
    cssGradient: 'linear-gradient(135deg, #eab308, #fcd34d, #eab308)',
    shadow: 'shadow-yellow-400/60',
    ring: 'ring-yellow-300/40',
    label: 'Gold',
    labelColor: 'text-yellow-600',
  },
  platinum: {
    gradient: 'from-cyan-500 via-teal-300 to-blue-500',
    cssGradient: 'linear-gradient(135deg, #06b6d4, #5eead4, #3b82f6)',
    shadow: 'shadow-cyan-400/60',
    ring: 'ring-cyan-300/40',
    label: 'Platinum',
    labelColor: 'text-cyan-600',
  },
  legendary: {
    gradient: 'from-purple-600 via-pink-500 to-rose-500',
    cssGradient: 'linear-gradient(135deg, #9333ea, #ec4899, #f43f5e)',
    shadow: 'shadow-purple-500/60',
    ring: 'ring-purple-400/40',
    label: 'Legendary',
    labelColor: 'text-purple-600',
  },
};

// ─── Condition engine ───────────────────────────────────────────────────────────
// Every badge stores an array of BadgeCondition (AND semantics) in the
// custom_badges table; this evaluates them against a user's stats.

/** current/target progress for one condition against the user's stats */
export function conditionProgress(c: BadgeCondition, stats: UserStats): { current: number; target: number } {
  switch (c.type) {
    case 'parks_visited':         return { current: stats.parksVisited,          target: c.count ?? 1 };
    case 'all_parks_visited':     return { current: stats.parksVisited,          target: stats.totalParks };
    case 'states_visited':        return { current: stats.statesVisited,         target: c.count ?? 1 };
    case 'bucket_list_count':     return { current: stats.bucketListCount,       target: c.count ?? 1 };
    case 'total_visits':          return { current: stats.totalVisits,           target: c.count ?? 1 };
    case 'visits_to_single_park': return { current: stats.maxVisitsToOnePark,    target: c.count ?? 1 };
    case 'parks_in_year':         return { current: stats.maxUniqueParksInAYear, target: c.count ?? 1 };
    case 'visits_in_year':        return { current: stats.maxVisitsInAYear,      target: c.count ?? 1 };
    case 'specific_parks': {
      const wanted = c.parkCodes ?? [];
      const visited = new Set(stats.visitedParkCodes);
      const matched = wanted.filter(code => visited.has(code)).length;
      const target = c.mode === 'any' ? Math.min(c.count ?? wanted.length, wanted.length) : wanted.length;
      return { current: Math.min(matched, target), target };
    }
  }
}

export function conditionMet(c: BadgeCondition, stats: UserStats): boolean {
  const { current, target } = conditionProgress(c, stats);
  return target > 0 && current >= target;
}

/** All conditions must hold. Empty condition lists never award. */
export function conditionsMet(conditions: BadgeCondition[], stats: UserStats): boolean {
  return conditions.length > 0 && conditions.every(c => conditionMet(c, stats));
}

/** Progress of the least-complete (binding) condition, for locked-badge display. */
export function conditionsProgress(conditions: BadgeCondition[], stats: UserStats): { current: number; target: number } | null {
  if (conditions.length === 0) return null;
  let worst: { current: number; target: number } | null = null;
  let worstRatio = Infinity;
  for (const c of conditions) {
    const p = conditionProgress(c, stats);
    const ratio = p.target > 0 ? p.current / p.target : 1;
    if (ratio < worstRatio) { worstRatio = ratio; worst = p; }
  }
  return worst;
}

/** Human-readable summary of one condition (admin UI + badge descriptions). */
export function describeCondition(c: BadgeCondition, parkNames?: Map<string, string>): string {
  const n = c.count ?? 1;
  switch (c.type) {
    case 'parks_visited':         return `Visit ${n} park${n === 1 ? '' : 's'}`;
    case 'all_parks_visited':     return `Visit every park`;
    case 'states_visited':        return `Visit parks in ${n} state${n === 1 ? '' : 's'}`;
    case 'bucket_list_count':     return `Add ${n} park${n === 1 ? '' : 's'} to your bucket list`;
    case 'total_visits':          return `Log ${n} total trip${n === 1 ? '' : 's'}`;
    case 'visits_to_single_park': return `Log ${n} trip${n === 1 ? '' : 's'} to the same park`;
    case 'parks_in_year':         return `Visit ${n} different park${n === 1 ? '' : 's'} in one calendar year`;
    case 'visits_in_year':        return `Log ${n} trip${n === 1 ? '' : 's'} in one calendar year`;
    case 'specific_parks': {
      const codes = c.parkCodes ?? [];
      const names = codes.map(code => parkNames?.get(code) ?? code.toUpperCase());
      const list = names.length <= 4 ? names.join(', ') : `${names.slice(0, 3).join(', ')} +${names.length - 3} more`;
      return c.mode === 'any'
        ? `Visit any ${Math.min(c.count ?? codes.length, codes.length)} of: ${list}`
        : `Visit all of: ${list}`;
    }
  }
}

// ─── Stats computation ─────────────────────────────────────────────────────────

export function computeStats(
  userVisits: Array<{ park_code: string; is_bucket_list: boolean | null; visited_date: Date | null }>,
  allParks: Array<{ park_code: string; states: string }>
): UserStats {
  const parksMap = new Map(allParks.map(p => [p.park_code, p.states]));

  const actualVisits = userVisits.filter(v => !v.is_bucket_list && v.visited_date);
  const bucketListItems = userVisits.filter(v => v.is_bucket_list);

  const visitedCodes = new Set(actualVisits.map(v => v.park_code));

  const statesSet = new Set<string>();
  visitedCodes.forEach(code => {
    const states = parksMap.get(code);
    if (states) states.split(',').forEach(s => { const t = s.trim(); if (t) statesSet.add(t); });
  });

  const thisYear = new Date().getFullYear();
  const parksThisYear = actualVisits.filter(
    v => v.visited_date && new Date(v.visited_date).getFullYear() === thisYear
  ).length;

  const byYear: Record<number, number> = {};
  const parksByYear: Record<number, Set<string>> = {};
  actualVisits.forEach(v => {
    if (v.visited_date) {
      const y = new Date(v.visited_date).getFullYear();
      byYear[y] = (byYear[y] ?? 0) + 1;
      (parksByYear[y] ??= new Set()).add(v.park_code);
    }
  });
  const maxParksInAYear = Object.values(byYear).length > 0 ? Math.max(...Object.values(byYear)) : 0;
  const maxUniqueParksInAYear = Object.values(parksByYear).reduce((m, s) => Math.max(m, s.size), 0);

  const byPark: Record<string, number> = {};
  actualVisits.forEach(v => { byPark[v.park_code] = (byPark[v.park_code] ?? 0) + 1; });
  const maxVisitsToOnePark = Object.values(byPark).reduce((m, n) => Math.max(m, n), 0);

  return {
    parksVisited: visitedCodes.size,
    totalParks: allParks.length,
    statesVisited: statesSet.size,
    bucketListCount: bucketListItems.length,
    parksThisYear,
    maxParksInAYear,
    totalVisits: actualVisits.length,
    maxVisitsToOnePark,
    maxVisitsInAYear: maxParksInAYear, // byYear counts visit logs per year
    maxUniqueParksInAYear,
    visitedParkCodes: Array.from(visitedCodes),
  };
}
