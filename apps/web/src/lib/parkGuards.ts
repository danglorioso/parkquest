// Guardrail rules for admin park writes, shared by the server (lib/parkAdmin.ts
// enforces them) and the admin panels (which mirror them to enable Save and
// show what's still needed). Import-safe from client components — must never
// pull in `@/lib/db`; same split as badges.ts vs badgeRevocation.ts.

import type { ParkSnapshot } from '@/lib/db/schema';

export type { ParkSnapshot };

export const EDITABLE_FIELDS = [
  'name', 'states', 'designation', 'is_national_park', 'latitude', 'longitude', 'description', 'image_url',
] as const satisfies readonly (keyof ParkSnapshot)[];
export type EditableField = (typeof EDITABLE_FIELDS)[number];

/** null ≡ '' (the form has no null), trimmed; coordinates compare numerically ("25.49" ≡ "25.490000"). */
export function sameValue(field: EditableField, a: unknown, b: unknown): boolean {
  const norm = (v: unknown) => (v === null || v === undefined ? '' : typeof v === 'string' ? v.trim() : v);
  const x = norm(a), y = norm(b);
  if ((field === 'latitude' || field === 'longitude') && x !== '' && y !== '') {
    const nx = Number(x), ny = Number(y);
    if (Number.isFinite(nx) && Number.isFinite(ny)) return nx === ny;
  }
  return x === y;
}

export function changedFields(before: Partial<ParkSnapshot> | null, after: Partial<ParkSnapshot>): EditableField[] {
  return EDITABLE_FIELDS.filter(f => !sameValue(f, before?.[f], after[f]));
}

export interface ParkImpact {
  isNew: boolean;
  nationalParks: { before: number; after: number };
  /** Park-type filters whose count changes (the park leaves one and/or joins another). */
  typeChanges: { key: string; label: string; before: number; after: number }[];
  /**
   * Enabled "visit every X" badges whose scope total grows with this change.
   * Holders who haven't visited this park drop below the new total, and the
   * next GET /api/badges (any badges/passport load) runs
   * revokeUnqualifiedBadges — which removes the badge and its feed post.
   */
  atRiskBadges: { badge_id: string; name: string; holders: { clerk_user_id: string; username: string | null }[] }[];
}

export interface ParkGuards {
  changedFields: EditableField[];
  /** Adding a park, or changing its designation or National Park flag — needs the park code typed to confirm. */
  structural: boolean;
  impact: ParkImpact;
  /** Set when the coordinates look wrong (outside the US, or far from where NPS places the park). */
  coordinateWarning: string | null;
}

/** Sent alongside a write; each is required only when its guard applies. */
export interface ParkWriteAcks {
  confirm_code?: unknown;
  acknowledge_badge_loss?: unknown;
  acknowledge_far_coordinates?: unknown;
}

export function badgeLossCount(impact: ParkImpact): number {
  return impact.atRiskBadges.reduce((n, b) => n + b.holders.length, 0);
}

/** What still has to be confirmed before this write is allowed; empty = go. */
export function missingAcks(parkCode: string, g: ParkGuards, acks: ParkWriteAcks): string[] {
  const missing: string[] = [];
  const typed = typeof acks.confirm_code === 'string' ? acks.confirm_code.trim().toLowerCase() : '';
  if (g.structural && typed !== parkCode) {
    missing.push(`Type the park code "${parkCode}" to confirm.`);
  }
  const losing = badgeLossCount(g.impact);
  if (losing > 0 && acks.acknowledge_badge_loss !== true) {
    missing.push(`Confirm that ${losing} badge holder${losing === 1 ? '' : 's'} will lose a badge.`);
  }
  if (g.coordinateWarning && acks.acknowledge_far_coordinates !== true) {
    missing.push(`Confirm the coordinates: ${g.coordinateWarning}`);
  }
  return missing;
}

export interface ParkChangeEntry {
  id: number;
  park_code: string;
  park_name: string | null;
  action: 'create' | 'update' | 'sync' | 'revert';
  before: ParkSnapshot | null;
  after: ParkSnapshot;
  changed_fields: EditableField[];
  admin_clerk_user_id: string;
  admin_username: string | null;
  reverts_change_id: number | null;
  /** Id of the change that reverted this one, if any. */
  reverted_by: number | null;
  created_at: string;
}
