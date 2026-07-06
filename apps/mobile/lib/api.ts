import type { EnrichedPost, EnrichedComment, PublicProfile, UserProfile, ParkWithStatus, BadgesResponse, Friend, FriendRequest } from '@parkquest/types';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

async function req<T>(path: string, token: string | null, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Activity ───────────────────────────────────────────────────────────────────

export type ActivityEvent =
  | { type: 'visit' | 'bucket' | 'post'; user_id: string; username: string | null; display_name: string | null; avatar_url: string | null; park_name: string | null; created_at: string | null }
  | { type: 'badge'; user_id: string; username: string | null; display_name: string | null; avatar_url: string | null; badge_id: string; badge_name: string; badge_emoji: string; created_at: string | null };

export const getActivity = (token: string) =>
  req<ActivityEvent[]>('/api/activity', token);

// ── Feed & Posts ───────────────────────────────────────────────────────────────

export const getFeed = (token: string, offset = 0) =>
  req<EnrichedPost[]>(`/api/feed?limit=20&offset=${offset}`, token);

export const getPosts = (token: string | null, userId?: string, parkCode?: string, offset = 0) => {
  const params = new URLSearchParams({ limit: '20', offset: String(offset) });
  if (userId) params.set('userId', userId);
  if (parkCode) params.set('parkCode', parkCode);
  return req<EnrichedPost[]>(`/api/posts?${params}`, token);
};

export const createPost = (token: string, body: { caption?: string; photos?: { url: string; key: string; name: string }[]; park_code?: string }) =>
  req<EnrichedPost>('/api/posts', token, { method: 'POST', body: JSON.stringify(body) });

export const likePost = (token: string, postId: number) =>
  req('/api/likes', token, { method: 'POST', body: JSON.stringify({ postId }) });

export const unlikePost = (token: string, postId: number) =>
  req(`/api/likes?postId=${postId}`, token, { method: 'DELETE' });

export const getComments = (token: string | null, postId: number) =>
  req<EnrichedComment[]>(`/api/comments?postId=${postId}`, token);

export const addComment = (token: string, postId: number, content: string) =>
  req('/api/comments', token, { method: 'POST', body: JSON.stringify({ postId, content }) });

// ── Profile & Users ────────────────────────────────────────────────────────────

export const getOwnProfile = (token: string) =>
  req<UserProfile>('/api/profile', token);

export const updateProfile = (token: string, updates: Partial<Pick<UserProfile, 'username' | 'display_name' | 'bio' | 'avatar_url'>>) =>
  req<UserProfile>('/api/profile', token, { method: 'PUT', body: JSON.stringify(updates) });

export const getUserProfile = (token: string | null, userId: string) =>
  req<PublicProfile>(`/api/profile/${userId}`, token);

export interface UserPublicProfile {
  clerk_user_id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  parks_visited: number;
  friend_count: number;
  friendship_status: 'none' | 'pending_sent' | 'pending_received' | 'accepted';
  friendship_id: number | null;
  is_own_profile: boolean;
  badges: { badge_id: string; earned_at: string | null; name: string; emoji: string; tier: string }[];
  recent_posts: EnrichedPost[];
  recent_visits: { park_code: string; name: string; states: string; visited_date: string | null; image_url: string | null }[];
}

export const getUserByUsername = (token: string | null, username: string) =>
  req<UserPublicProfile>(`/api/users/${username}`, token);

export const searchUsers = (token: string | null, query: string) =>
  req<PublicProfile[]>(`/api/users?search=${encodeURIComponent(query)}`, token);

export const getSuggestions = (token: string) =>
  req<Array<{ clerk_user_id: string; username: string | null; display_name: string | null; avatar_url: string | null; mutual_friends: number; shared_parks: number }>>('/api/users/suggestions', token);

// ── Friends ────────────────────────────────────────────────────────────────────

export const getFriends = (token: string, userId: string) =>
  req<Friend[]>(`/api/friends?userId=${userId}&type=friends`, token);

export const getPendingRequests = (token: string, userId: string) =>
  req<FriendRequest[]>(`/api/friends?userId=${userId}&type=pending_incoming`, token);

export const sendFriendRequest = (token: string, userId: string) =>
  req('/api/friends', token, { method: 'POST', body: JSON.stringify({ userId }) });

export const respondFriendRequest = (token: string, friendshipId: number, action: 'accept' | 'reject') =>
  req('/api/friends', token, { method: 'PATCH', body: JSON.stringify({ friendshipId, action }) });

export const removeFriend = (token: string, userId: string) =>
  req(`/api/friends?userId=${userId}`, token, { method: 'DELETE' });

// ── Parks ──────────────────────────────────────────────────────────────────────

export interface ParkDetail {
  park_code: string;
  name: string;
  states: string;
  description: string | null;
  latitude: string | null;
  longitude: string | null;
  image_url: string | null;
}

export const getParks = (token: string | null) =>
  req<ParkDetail[]>('/api/parks', token);

export const getPark = (token: string | null, parkCode: string) =>
  req<ParkDetail>(`/api/parks/${parkCode}`, token);

// ── NPS detail data (gallery images, activities, hours, fees, contact, etc.) ────
// Shared shape between the per-park detail screen and the offline "download for
// offline" flow, which needs the exact same fields to cache anything meaningful.

export interface NpsImage {
  url: string;
  title: string;
  altText: string;
  credit: string;
}

export interface NpsHours {
  name: string;
  description: string;
  standardHours: Record<string, string>;
}

export interface NpsFee {
  cost: string;
  title: string;
  description: string;
}

export interface NpsData {
  images: NpsImage[];
  activities: string[];
  topics: string[];
  operatingHours: NpsHours[];
  entranceFees: NpsFee[];
  directionsInfo: string;
  directionsUrl: string;
  weatherInfo: string;
  phone: string;
  email: string;
  url: string;
  designation: string;
}

export const getParkNPS = (token: string | null, parkCode: string) =>
  req<NpsData>(`/api/parks/${parkCode}/nps`, token);

// Bulk variant — every park's full NPS payload in one upstream request, keyed by
// park_code. Used by the offline-download flow instead of N per-park calls.
export const getParksNpsAll = (token: string | null) =>
  req<Record<string, NpsData>>('/api/parks/nps-all', token);

export const getParkWeather = (token: string | null, parkCode: string) =>
  req<any>(`/api/parks/${parkCode}/weather`, token);

// Friends (of the current user) who've logged a non-private visit to this
// park — powers the "N friends have visited" mutuals indicator on the park
// detail screen. `friends` is capped to a few profiles for the avatar stack;
// `total` reflects everyone.
export interface ParkVisitorsSummary {
  friends: Array<{
    clerk_user_id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  }>;
  total: number;
}

export const getParkVisitors = (token: string | null, parkCode: string) =>
  req<ParkVisitorsSummary>(`/api/parks/${parkCode}/visitors`, token);

// ── Visits ─────────────────────────────────────────────────────────────────────

export interface VisitEntry {
  id: number;
  park_code: string;
  park_name: string | null;
  states: string | null;
  visited_date: string | null;
  end_date: string | null;
  is_bucket_list: boolean;
  rating: number | null;
  crowd: number | null;
  difficulty: number | null;
  weather_conditions: string[] | null;
  activities: string[] | null;
  companions: string[] | null;
  would_return: boolean | null;
  highlight: string | null;
  title: string | null;
  notes: string | null;
  photos: { url: string; key: string; name: string }[] | null;
  cover_photo: { url: string; key: string; name: string } | null;
  visibility: string | null;
  created_at: string | null;
}

export const getVisits = (token: string) =>
  req<VisitEntry[]>('/api/visits', token);

export const createVisit = (token: string, body: {
  park_code: string;
  visited_date?: string;
  end_date?: string;
  rating?: number;
  notes?: string;
  title?: string;
  activities?: string[];
  companions?: string[];
  photos?: { url: string; key: string; name: string }[];
  visibility?: string;
  is_bucket_list?: boolean;
}) => req<VisitEntry>('/api/visits', token, { method: 'POST', body: JSON.stringify(body) });

export const updateVisit = (token: string, id: number, body: Partial<Parameters<typeof createVisit>[1]>) =>
  req<VisitEntry>(`/api/visits/${id}`, token, { method: 'PATCH', body: JSON.stringify(body) });

export const deleteVisit = (token: string, id: number) =>
  req(`/api/visits/${id}`, token, { method: 'DELETE' });

// ── Badges ─────────────────────────────────────────────────────────────────────

export const getBadges = (token: string) =>
  req<BadgesResponse>('/api/badges', token);

// ── Notifications ──────────────────────────────────────────────────────────────

export type NotificationType =
  | 'friend_request' | 'friend_accepted' | 'like' | 'comment' | 'post'
  | 'visit_logged' | 'badge_earned' | 'system' | 'recommendation';

export interface NotificationItem {
  id: number;
  type: NotificationType;
  actor_id: string | null;
  actor_username: string | null;
  actor_display_name: string | null;
  actor_avatar_url: string | null;
  post_id: number | null;
  park_code: string | null;
  park_name: string | null;
  metadata: {
    message?: string;
    excerpt?: string;
    friendship_id?: number;
    badge_id?: string;
    badge_name?: string;
    badge_emoji?: string;
  } | null;
  read: boolean;
  created_at: string;
}

export const getNotifications = (token: string, limit = 50) =>
  req<NotificationItem[]>(`/api/notifications?limit=${limit}`, token);

export const getUnreadNotificationCount = (token: string) =>
  req<{ unread_count: number }>('/api/notifications?count=true', token);

export const markNotificationsRead = (token: string, ids?: number[]) =>
  req('/api/notifications', token, {
    method: 'PATCH',
    body: JSON.stringify(ids && ids.length > 0 ? { ids } : { all: true }),
  });

export const dismissNotification = (token: string, id: number) =>
  req(`/api/notifications/${id}`, token, { method: 'DELETE' });
