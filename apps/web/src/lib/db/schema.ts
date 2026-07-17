import {
  pgTable, text, timestamp, varchar, integer, real,
  serial, jsonb, boolean, unique, primaryKey, date,
} from 'drizzle-orm/pg-core';

export const parks = pgTable('parks', {
  park_code: varchar('park_code', { length: 10 }).notNull().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  states: varchar('states', { length: 100 }).notNull(),
  description: text('description'),
  latitude: varchar('latitude', { length: 50 }),
  longitude: varchar('longitude', { length: 50 }),
  image_url: text('image_url'),
  created_at: timestamp('created_at').defaultNow(),
});

export const userProfiles = pgTable('user_profiles', {
  clerk_user_id: varchar('clerk_user_id', { length: 255 }).notNull().primaryKey(),
  username: varchar('username', { length: 50 }).notNull().unique(),
  display_name: varchar('display_name', { length: 100 }),
  bio: text('bio'),
  avatar_url: text('avatar_url'),
  last_seen_at: timestamp('last_seen_at'), // updated by touchActivity() on authed reads
  // Mirrors Clerk publicMetadata.role === 'admin'. Synced lazily by
  // requireAdmin() — Clerk is the source of truth for authZ; this column
  // only exists so feeds/comments can render the admin star without a
  // per-author Clerk lookup. Never grant access based on it.
  is_admin: boolean('is_admin').notNull().default(false),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});

// One row per user per Eastern-time day, upserted by touchActivity() — the
// concrete "opened the app" record behind the admin dashboard's DAU stats.
// Write actions (posts/likes/...) are visible in their own tables; this
// exists so read-only sessions count too.
export const userActivityDays = pgTable('user_activity_days', {
  clerk_user_id: varchar('clerk_user_id', { length: 255 }).notNull(),
  day: date('day').notNull(),
  last_seen_at: timestamp('last_seen_at').defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.clerk_user_id, t.day] })]);

export const visits = pgTable('visits', {
  id: serial('id').primaryKey(),
  clerk_user_id: varchar('clerk_user_id', { length: 255 }).notNull(),
  park_code: varchar('park_code', { length: 10 }).notNull().references(() => parks.park_code),
  visited_date: timestamp('visited_date'), // null = bucket list item
  end_date: timestamp('end_date'),         // null = single-day visit
  rating: real('rating'),
  crowd: integer('crowd'),                 // 1-5 scale
  difficulty: integer('difficulty'),       // 1-5 scale
  weather_conditions: jsonb('weather_conditions').$type<string[]>(),
  activities: jsonb('activities').$type<string[]>(),
  companions: jsonb('companions').$type<string[]>(), // clerk_user_ids
  would_return: varchar('would_return', { length: 10 }), // 'yes' | 'maybe' | 'no'
  highlight: text('highlight'),
  title: varchar('title', { length: 255 }),
  notes: text('notes'),
  photos: jsonb('photos').$type<string[]>(),
  cover_photo: text('cover_photo'),
  visibility: varchar('visibility', { length: 20 }).default('private'), // 'public' | 'friends' | 'private'
  is_bucket_list: boolean('is_bucket_list').default(false),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});

export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  clerk_user_id: varchar('clerk_user_id', { length: 255 }).notNull(),
  park_code: varchar('park_code', { length: 10 }).references(() => parks.park_code),
  visit_id: integer('visit_id').references(() => visits.id, { onDelete: 'set null' }),
  caption: text('caption'),
  photos: jsonb('photos').$type<{ url: string; key: string; name: string }[]>(),
  quoted_post_id: integer('quoted_post_id'),  // set for quote/repost posts
  badge_id: varchar('badge_id', { length: 100 }), // set for badge share posts
  // 'public' | 'friends' | 'private' — for visit posts the linked visit's
  // visibility takes precedence (the visit is the source of truth)
  visibility: varchar('visibility', { length: 20 }).default('public'),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});

export const friendships = pgTable('friendships', {
  id: serial('id').primaryKey(),
  requester_id: varchar('requester_id', { length: 255 }).notNull(),
  recipient_id: varchar('recipient_id', { length: 255 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'), // 'pending' | 'accepted' | 'rejected'
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
}, (t) => [unique().on(t.requester_id, t.recipient_id)]);

export const likes = pgTable('likes', {
  user_id: varchar('user_id', { length: 255 }).notNull(),
  post_id: integer('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  created_at: timestamp('created_at').defaultNow(),
}, (t) => [primaryKey({ columns: [t.user_id, t.post_id] })]);

export const comments = pgTable('comments', {
  id: serial('id').primaryKey(),
  user_id: varchar('user_id', { length: 255 }).notNull(),
  post_id: integer('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  created_at: timestamp('created_at').defaultNow(),
});

export const userBadges = pgTable('user_badges', {
  id: serial('id').primaryKey(),
  clerk_user_id: varchar('clerk_user_id', { length: 255 }).notNull(),
  badge_id: varchar('badge_id', { length: 100 }).notNull(),
  earned_at: timestamp('earned_at').defaultNow().notNull(),
}, (t) => [unique().on(t.clerk_user_id, t.badge_id)]);

// Every badge — the original launch set and anything an admin has added since
// — is a row here. Evaluated through the condition engine in lib/badges.ts.
export const customBadges = pgTable('custom_badges', {
  id: serial('id').primaryKey(),
  badge_id: varchar('badge_id', { length: 100 }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description').notNull(),
  emoji: varchar('emoji', { length: 20 }).notNull(),
  tier: varchar('tier', { length: 20 }).notNull().default('bronze'), // BadgeTier
  colors: jsonb('colors').$type<import('@parkquest/types').BadgeColors>(), // null = tier colors
  conditions: jsonb('conditions').$type<import('@parkquest/types').BadgeCondition[]>().notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

export type CustomBadgeRow = typeof customBadges.$inferSelect;
export type NewCustomBadgeRow = typeof customBadges.$inferInsert;

export type Park = typeof parks.$inferSelect;
export type NewPark = typeof parks.$inferInsert;
export type UserProfile = typeof userProfiles.$inferSelect;
export type NewUserProfile = typeof userProfiles.$inferInsert;
export type Visit = typeof visits.$inferSelect;
export type NewVisit = typeof visits.$inferInsert;
export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type Friendship = typeof friendships.$inferSelect;
export type NewFriendship = typeof friendships.$inferInsert;
export type Like = typeof likes.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;
export type UserBadge = typeof userBadges.$inferSelect;

export const blocks = pgTable('blocks', {
  id: serial('id').primaryKey(),
  blocker_id: varchar('blocker_id', { length: 255 }).notNull(),
  blocked_id: varchar('blocked_id', { length: 255 }).notNull(),
  reason: text('reason'),
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (t) => [unique().on(t.blocker_id, t.blocked_id)]);

export const reports = pgTable('reports', {
  id: serial('id').primaryKey(),
  reporter_id: varchar('reporter_id', { length: 255 }).notNull(),
  target_type: varchar('target_type', { length: 20 }).notNull(), // 'post' | 'comment' | 'user'
  target_id: varchar('target_id', { length: 255 }).notNull(),    // post.id / comment.id / clerk_user_id, stringified
  reason: varchar('reason', { length: 40 }).notNull(),           // 'spam' | 'harassment' | 'inappropriate' | 'impersonation' | 'misleading' | 'blocked' | 'other'
  details: text('details'),
  status: varchar('status', { length: 20 }).notNull().default('open'), // 'open' | 'actioned' | 'dismissed'
  reviewed_by: varchar('reviewed_by', { length: 255 }),
  reviewed_at: timestamp('reviewed_at'),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

export type Block = typeof blocks.$inferSelect;
export type NewBlock = typeof blocks.$inferInsert;
export type Report = typeof reports.$inferSelect;
export type NewReport = typeof reports.$inferInsert;

export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  recipient_id: varchar('recipient_id', { length: 255 }).notNull(),
  actor_id: varchar('actor_id', { length: 255 }),
  type: varchar('type', { length: 50 }).notNull(), // 'friend_request' | 'friend_accepted' | 'like' | 'comment' | 'post' | 'visit_logged' | 'badge_earned' | 'system' | 'recommendation'
  post_id: integer('post_id').references(() => posts.id, { onDelete: 'cascade' }),
  visit_id: integer('visit_id').references(() => visits.id, { onDelete: 'cascade' }),
  park_code: varchar('park_code', { length: 10 }).references(() => parks.park_code),
  metadata: jsonb('metadata').$type<{ message?: string; excerpt?: string; friendship_id?: number; badge_id?: string; badge_name?: string; badge_emoji?: string; title?: string; audience_label?: string }>(),
  read: boolean('read').default(false).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: serial('id').primaryKey(),
  clerk_user_id: varchar('clerk_user_id', { length: 255 }).notNull(),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

export type PushSubscription = typeof pushSubscriptions.$inferSelect;

export const expoPushTokens = pgTable('expo_push_tokens', {
  id: serial('id').primaryKey(),
  clerk_user_id: varchar('clerk_user_id', { length: 255 }).notNull(),
  token: text('token').notNull().unique(),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

// One row per calendar day, upserted from the App Store Connect Sales
// Reports API (see src/lib/appStoreConnect.ts). Apple's own reports lag
// 24-48h, so a given day's row can be re-fetched and overwritten as later,
// more complete data becomes available.
export const appStoreDailyStats = pgTable('app_store_daily_stats', {
  report_date: date('report_date').notNull().primaryKey(),
  units: integer('units').notNull(),
  proceeds: real('proceeds').notNull(),
  proceeds_currency: varchar('proceeds_currency', { length: 3 }).notNull(),
  // Analytics Reports API metrics (impressions/page views/download splits) —
  // a separate Apple pipeline from the sales report above, so these arrive
  // on their own schedule. NULL = not fetched for this day yet, distinct
  // from a real zero.
  impressions: integer('impressions'),
  impressions_unique: integer('impressions_unique'),
  product_page_views: integer('product_page_views'),
  first_time_downloads: integer('first_time_downloads'),
  redownloads: integer('redownloads'),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

export type AppStoreDailyStats = typeof appStoreDailyStats.$inferSelect;

// Per-device split of App Store downloads (admin dashboard's device donut),
// from the same Analytics "App Downloads" report — keyed by Apple's Device
// dimension (iPhone, iPad, Desktop, …).
export const appStoreDeviceDownloads = pgTable('app_store_device_downloads', {
  report_date: date('report_date').notNull(),
  device: varchar('device', { length: 64 }).notNull(),
  first_time_downloads: integer('first_time_downloads').notNull().default(0),
  redownloads: integer('redownloads').notNull().default(0),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.report_date, t.device] })]);

export type AppStoreDeviceDownloads = typeof appStoreDeviceDownloads.$inferSelect;
