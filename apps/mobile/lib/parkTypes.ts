import { PARK_TYPE_DEFS, matchesParkType } from '@parkquest/types';

// One entry per park designation the app tracks — a park matches exactly one.
// The list itself lives in @parkquest/types (PARK_TYPE_DEFS), shared with the
// web map and the admin park editor; every screen that filters by park type
// (map, parks list) reads from this same list, so nothing else needs to
// change to scale to a dozen of these.
export interface ParkTypeOption {
  key: string;
  label: string;
  match: (p: { is_national_park?: boolean; designation?: string | null }) => boolean;
}

export const PARK_TYPES: ParkTypeOption[] = PARK_TYPE_DEFS.map(d => ({
  key: d.key,
  label: d.label,
  match: p => matchesParkType(d, p),
}));
