import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { userProfiles } from '@/lib/db/schema';

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const existing = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.clerk_user_id, userId))
      .limit(1);

    if (existing.length > 0) {
      const row = existing[0];
      // Backfill display_name / avatar_url from Clerk if not yet synced
      if (!row.display_name || !row.avatar_url) {
        const clerkUser = await currentUser();
        if (clerkUser) {
          const updates: Record<string, unknown> = { updated_at: new Date() };
          if (!row.display_name && clerkUser.fullName) updates.display_name = clerkUser.fullName;
          if (!row.avatar_url && clerkUser.imageUrl) updates.avatar_url = clerkUser.imageUrl;
          const [updated] = await db
            .update(userProfiles)
            .set(updates)
            .where(eq(userProfiles.clerk_user_id, userId))
            .returning();
          return NextResponse.json(updated ?? row);
        }
      }
      return NextResponse.json(row);
    }

    // Auto-create profile from Clerk data on first access
    const clerkUser = await currentUser();
    const rawUsername =
      clerkUser?.username ??
      clerkUser?.emailAddresses[0]?.emailAddress?.split('@')[0] ??
      `user_${userId.slice(-8)}`;
    const baseUsername = rawUsername.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 50);

    // Ensure username is unique by appending a suffix if needed
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
      .returning();

    return NextResponse.json(created);
  } catch (error) {
    console.error('Error fetching profile:', error);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { username, display_name, bio, avatar_url } = await request.json();

    if (username !== undefined) {
      if (!/^[a-z0-9_]{3,50}$/.test(username)) {
        return NextResponse.json(
          { error: 'Username must be 3–50 characters: lowercase letters, numbers, underscores only' },
          { status: 400 }
        );
      }
      const taken = await db
        .select({ clerk_user_id: userProfiles.clerk_user_id })
        .from(userProfiles)
        .where(eq(userProfiles.username, username))
        .limit(1);
      if (taken.length > 0 && taken[0].clerk_user_id !== userId) {
        return NextResponse.json({ error: 'Username already taken' }, { status: 409 });
      }
    }

    const updates: Partial<typeof userProfiles.$inferInsert> = { updated_at: new Date() };
    if (username !== undefined) updates.username = username;
    if (display_name !== undefined) updates.display_name = display_name;
    if (bio !== undefined) updates.bio = bio;
    if (avatar_url !== undefined) updates.avatar_url = avatar_url;

    const [updated] = await db
      .update(userProfiles)
      .set(updates)
      .where(eq(userProfiles.clerk_user_id, userId))
      .returning();

    if (!updated) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating profile:', error);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
