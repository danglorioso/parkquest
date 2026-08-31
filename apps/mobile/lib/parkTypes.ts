// One entry per park designation the app tracks — a park matches exactly one.
// Add a row here (matching the real NPS `designation` string) whenever a new
// batch gets seeded (Monuments, Memorials, ...); every screen that filters
// by park type (map, parks list) reads from this same list, so nothing else
// needs to change to scale to a dozen of these.
export interface ParkTypeOption {
  key: string;
  label: string;
  match: (p: { is_national_park?: boolean; designation?: string | null }) => boolean;
}

export const PARK_TYPES: ParkTypeOption[] = [
  { key: 'national_park',   label: 'National Parks',            match: p => !!p.is_national_park },
  { key: 'historical_park', label: 'National Historical Parks', match: p => p.designation === 'National Historical Park' },
  { key: 'monument',        label: 'National Monuments',        match: p => p.designation === 'National Monument' },
];
