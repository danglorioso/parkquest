export type ParkStatus = 'unvisited' | 'bucket_list' | 'visited';
export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'legendary';

export interface Park {
  park_code: string;
  name: string;
  states: string;
  description: string | null;
  latitude: string | null;
  longitude: string | null;
  created_at: Date | null;
}

export interface PhotoMeta {
  url: string;
  key: string;
  name: string;
}

export interface Visit {
  id: number;
  clerk_user_id: string;
  park_code: string;
  visited_date: Date | null;
  rating: number | null;
  title: string | null;
  notes: string | null;
  photos: PhotoMeta[] | null;
  visibility: string | null;
  is_bucket_list: boolean | null;
  created_at: Date | null;
  updated_at: Date | null;
}

export interface UserProfile {
  clerk_user_id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  created_at: Date | null;
  updated_at: Date | null;
}

export type FriendshipStatus = 'none' | 'pending_sent' | 'pending_received' | 'accepted';

export interface PublicProfile extends UserProfile {
  parks_visited: number;
  friend_count: number;
  friendship_status: FriendshipStatus;
}

export interface Post {
  id: number;
  clerk_user_id: string;
  park_code: string | null;
  visit_id: number | null;
  caption: string | null;
  photos: PhotoMeta[] | null;
  created_at: Date | null;
  updated_at: Date | null;
}

export interface EnrichedPost extends Post {
  park_name: string | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
}

export interface Friend {
  clerk_user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  friends_since: Date | null;
}

export interface FriendRequest {
  friendship_id: number;
  clerk_user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  requested_at: Date | null;
}

export interface EnrichedComment {
  id: number;
  content: string;
  created_at: Date | null;
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export type ReportTargetType = 'post' | 'comment' | 'user';
export type ReportReason = 'spam' | 'harassment' | 'inappropriate' | 'impersonation' | 'misleading' | 'blocked' | 'other';
export type ReportStatus = 'open' | 'actioned' | 'dismissed';

export interface Report {
  id: number;
  reporter_id: string;
  target_type: ReportTargetType;
  target_id: string;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  created_at: Date | null;
}

export interface EnrichedReport extends Report {
  reporter_username: string | null;
  target_user_id: string | null; // clerk id of the reported user / content author
  target_username: string | null;
  target_display_name: string | null;
  target_content: string | null; // post caption / comment content, when applicable
  target_photos: string[] | null; // post photos, when target_type is 'post'
}

export interface BlockedUser {
  clerk_user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  blocked_at: Date | null;
}

/** Optional per-badge color pair; when absent, clients fall back to the tier palette. */
export interface BadgeColors {
  fill: string;  // main color, hex
  light: string; // lighter accent, hex
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  emoji: string;
  tier: BadgeTier;
  colors?: BadgeColors | null;
  earned: boolean;
  earned_at: Date | null;
  progress_current: number | null;
  progress_target: number | null;
}

export interface UserStats {
  parksVisited: number;
  totalParks: number;
  statesVisited: number;
  bucketListCount: number;
  parksThisYear: number;
  maxParksInAYear: number;
}

export interface BadgesResponse {
  badges: Badge[];
  stats: UserStats;
}

// ── Custom badges (admin-defined) ───────────────────────────────────────────

/**
 * A single earning condition for an admin-defined badge. All conditions on a
 * badge must hold (AND). Numeric types compare a user stat against `count`.
 */
export type BadgeConditionType =
  | 'parks_visited'          // unique parks visited >= count
  | 'all_parks_visited'      // visited every park in the system (count ignored)
  | 'states_visited'         // unique states visited >= count
  | 'bucket_list_count'      // bucket list items >= count
  | 'total_visits'           // total visit logs (trips) >= count
  | 'visits_to_single_park'  // most trips logged to any one park >= count
  | 'parks_in_year'          // unique parks visited in one calendar year >= count
  | 'visits_in_year'         // visit logs in one calendar year >= count
  | 'specific_parks';        // visited a specific collection of parks

export interface BadgeCondition {
  type: BadgeConditionType;
  /** Threshold for numeric types; for specific_parks + mode 'any', how many of the listed parks. */
  count?: number;
  /** specific_parks only: the park collection. */
  parkCodes?: string[];
  /** specific_parks only: visit 'all' listed parks, or 'any' `count` of them. Defaults to 'all'. */
  mode?: 'all' | 'any';
}

export interface CustomBadge {
  id: number;
  badge_id: string;
  name: string;
  description: string;
  emoji: string;
  tier: BadgeTier;
  colors?: BadgeColors | null;
  conditions: BadgeCondition[];
  enabled: boolean;
  created_at: Date | null;
  updated_at: Date | null;
}

/** Minimal display info for any badge (static or custom), for rendering share posts etc. */
export interface BadgeDef {
  id: string;
  name: string;
  description: string;
  emoji: string;
  tier: BadgeTier;
  colors?: BadgeColors | null;
}

// Convenience type for park + visit status on map/list views
export interface ParkWithStatus extends Park {
  status: ParkStatus;
  visit?: Visit;
}
