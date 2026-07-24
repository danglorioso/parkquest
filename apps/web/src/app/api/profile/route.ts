import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { userProfiles } from '@/lib/db/schema';
import { ensureUserProfile } from '@/lib/ensureUserProfile';
import { touchActivity } from '@/lib/activity';

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    touchActivity(userId);

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

    const created = await ensureUserProfile(userId);
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

    const current = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.clerk_user_id, userId))
      .limit(1);
    const currentRow = current[0];

    const RENAME_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
    const cooldownRemaining = (lastChangedAt: Date | null | undefined) => {
      if (!lastChangedAt) return 0;
      return RENAME_COOLDOWN_MS - (Date.now() - lastChangedAt.getTime());
    };
    const formatRemaining = (ms: number) => {
      const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
      return days <= 1 ? '1 day' : `${days} days`;
    };

    const usernameChanging = username !== undefined && username !== currentRow?.username;
    const displayNameChanging = display_name !== undefined && display_name !== currentRow?.display_name;

    if (usernameChanging) {
      if (!/^[a-z0-9_]{3,50}$/.test(username)) {
        return NextResponse.json(
          { error: 'Username must be 3–50 characters: lowercase letters, numbers, underscores only' },
          { status: 400 }
        );
      }
      const remaining = cooldownRemaining(currentRow?.username_changed_at);
      if (remaining > 0) {
        return NextResponse.json(
          { error: `Username can only be changed once a week. Try again in ${formatRemaining(remaining)}.` },
          { status: 429 }
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

    if (displayNameChanging) {
      const remaining = cooldownRemaining(currentRow?.display_name_changed_at);
      if (remaining > 0) {
        return NextResponse.json(
          { error: `Display name can only be changed once a week. Try again in ${formatRemaining(remaining)}.` },
          { status: 429 }
        );
      }
    }

    const updates: Partial<typeof userProfiles.$inferInsert> = { updated_at: new Date() };
    if (username !== undefined) updates.username = username;
    if (display_name !== undefined) updates.display_name = display_name;
    if (bio !== undefined) updates.bio = bio;
    if (avatar_url !== undefined) updates.avatar_url = avatar_url;
    if (usernameChanging) updates.username_changed_at = new Date();
    if (displayNameChanging) updates.display_name_changed_at = new Date();

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
