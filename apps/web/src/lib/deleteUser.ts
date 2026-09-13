import { clerkClient } from '@clerk/nextjs/server';
import { and, eq, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  notifications,
  pushSubscriptions,
  expoPushTokens,
  likes,
  comments,
  posts,
  visits,
  friendships,
  userBadges,
  userProfiles,
  blocks,
  reports,
} from '@/lib/db/schema';

// Shared by self-serve account deletion (/api/account) and admin-triggered
// removal (/api/admin/users/[id]) so the two never drift out of sync — this
// list has no FK cascade to lean on, it has to be kept by hand.
export async function deleteUserData(userId: string) {
  // Delete in dependency order; posts cascade likes/comments/notifications via FK
  await db.delete(notifications).where(
    or(eq(notifications.recipient_id, userId), eq(notifications.actor_id, userId))
  );
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.clerk_user_id, userId));
  await db.delete(expoPushTokens).where(eq(expoPushTokens.clerk_user_id, userId));
  await db.delete(likes).where(eq(likes.user_id, userId));
  await db.delete(comments).where(eq(comments.user_id, userId));
  await db.delete(posts).where(eq(posts.clerk_user_id, userId));
  await db.delete(visits).where(eq(visits.clerk_user_id, userId));
  await db.delete(friendships).where(
    or(eq(friendships.requester_id, userId), eq(friendships.recipient_id, userId))
  );
  await db.delete(userBadges).where(eq(userBadges.clerk_user_id, userId));
  await db.delete(blocks).where(
    or(eq(blocks.blocker_id, userId), eq(blocks.blocked_id, userId))
  );
  await db.delete(reports).where(
    or(eq(reports.reporter_id, userId), and(eq(reports.target_type, 'user'), eq(reports.target_id, userId)))
  );
  await db.delete(userProfiles).where(eq(userProfiles.clerk_user_id, userId));
}

export async function deleteUserAccount(userId: string) {
  await deleteUserData(userId);

  const clerk = await clerkClient();
  // Admin-triggered path can target a user_profiles row whose Clerk account
  // is already gone (see the `deleted` flag in /api/admin/users) — tolerate
  // a missing Clerk user instead of failing the whole purge.
  await clerk.users.deleteUser(userId).catch(() => {});
}
