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

export interface Badge {
  id: string;
  name: string;
  description: string;
  emoji: string;
  tier: BadgeTier;
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

// Convenience type for park + visit status on map/list views
export interface ParkWithStatus extends Park {
  status: ParkStatus;
  visit?: Visit;
}
