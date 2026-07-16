import { after } from 'next/server';
import { eq } from 'drizzle-orm';
import { currentUser } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { userProfiles, type UserProfile } from '@/lib/db/schema';
import { notifyAdminNewUser } from '@/lib/notifyAdmin';

// Minimal shape both `currentUser()` (session-bound) and the Clerk
// `user.created` webhook payload (arbitrary user, no session) can supply.
interface ClerkUserSnapshot {
  username: string | null;
  emailAddresses: { emailAddress: string }[];
  fullName: string | null;
  imageUrl: string | null;
}

async function createProfileRow(userId: string, clerkUser: ClerkUserSnapshot | null): Promise<UserProfile> {
  const rawUsername =
    clerkUser?.username ??
    clerkUser?.emailAddresses[0]?.emailAddress?.split('@')[0] ??
    `user_${userId.slice(-8)}`;
  const baseUsername = rawUsername.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 50);

  const taken = await db
    .select({ username: userProfiles.username })
    .from(userProfiles)
    .where(eq(userProfiles.username, baseUsername))
    .limit(1);
  const username = taken.length > 0 ? `${baseUsername}_${userId.slice(-4)}` : baseUsername;

  const [created] = await db
    .insert(userProfiles)
    .values({
      clerk_user_id: userId,
      username,
      display_name: clerkUser?.fullName ?? null,
      avatar_url: clerkUser?.imageUrl ?? null,
    })
    .onConflictDoNothing()
    .returning();

  // Concurrent request won the race and inserted first — re-fetch its row.
  if (!created) {
    const [row] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.clerk_user_id, userId))
      .limit(1);
    return row;
  }

  after(() => notifyAdminNewUser({
    clerkUserId: userId,
    username: created.username,
    displayName: created.display_name,
  }).catch(() => {}));

  return created;
}

// Clerk auth alone doesn't guarantee a user_profiles row exists — onboarding
// creates it client-side after signup, and that call can fail silently
// (session-propagation race, transient DB error, OAuth signups skipping the
// client onboarding step entirely). Any route that requires the CURRENT
// user's profile to exist should call this instead of assuming auth() =
// profile. For backfilling a *different* user's profile (no session to read
// from), use `createUserProfileFromWebhook` instead.
export async function ensureUserProfile(userId: string): Promise<UserProfile> {
  const existing = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.clerk_user_id, userId))
    .limit(1);
  if (existing.length > 0) return existing[0];

  const clerkUser = await currentUser();
  return createProfileRow(userId, clerkUser);
}

// Same row-creation logic, driven by a Clerk webhook payload instead of the
// request's own session — this is what actually closes the gap that lets a
// user exist in Clerk but never get a user_profiles row (seen with Apple/
// Google SSO signups, where the client never lands on the onboarding screen
// that would otherwise call ensureUserProfile). See
// /api/webhooks/clerk/route.ts.
export async function createUserProfileFromWebhook(userId: string, clerkUser: ClerkUserSnapshot): Promise<UserProfile> {
  const existing = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.clerk_user_id, userId))
    .limit(1);
  if (existing.length > 0) return existing[0];

  return createProfileRow(userId, clerkUser);
}
