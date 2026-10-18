/**
 * Park-type taxonomy — one entry per park designation the app tracks. The web
 * map control, the mobile map/parks filters, and the admin park editor all
 * build from this list, so it's also the contract for which designations an
 * admin can give a park without shipping a build: a non-National-Park row
 * whose `designation` isn't listed here matches no park-type filter, so it
 * would be invisible on every map/list in already-shipped app builds.
 *
 * Adding a designation is a deliberate code change: add a row here, then wire
 * its badge scope (see BadgeParkScope).
 */
export interface ParkTypeDef {
  key: string;
  /** Plural, as shown in filter menus. */
  label: string;
  /**
   * Exact NPS `designation` string. Absent only for 'national_park', which
   * keys off the curated `is_national_park` flag instead, since NPS spells
   * that designation several different ways.
   */
  designation?: string;
}

export const PARK_TYPE_DEFS: ParkTypeDef[] = [
  { key: 'national_park',   label: 'National Parks' },
  { key: 'historical_park', label: 'National Historical Parks', designation: 'National Historical Park' },
  { key: 'monument',        label: 'National Monuments',        designation: 'National Monument' },
  { key: 'historic_site',   label: 'National Historic Sites',   designation: 'National Historic Site' },
  { key: 'preserve',        label: 'National Preserves',        designation: 'National Preserve' },
  { key: 'recreation_area', label: 'National Recreation Areas', designation: 'National Recreation Area' },
  { key: 'seashore',        label: 'National Seashores',        designation: 'National Seashore' },
];

export function matchesParkType(
  def: ParkTypeDef,
  p: { is_national_park?: boolean; designation?: string | null },
): boolean {
  return def.designation ? p.designation === def.designation : !!p.is_national_park;
}

/** Designations a non-National-Park row may carry and still match a park-type filter. */
export const TRACKED_DESIGNATIONS: string[] = PARK_TYPE_DEFS.flatMap(d => (d.designation ? [d.designation] : []));
