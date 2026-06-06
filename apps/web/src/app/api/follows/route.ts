import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { follows, userProfiles, notifications } from '@/lib/db/schema';
import { sendPushToUser } from '@/lib/push';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const type = searchParams.get('type') ?? 'following'; // 'followers' | 'following'
    const limit = Math.min(Number(searchParams.get('limit') ?? '50'), 100);
    const offset = Number(searchParams.get('offset') ?? '0');

    if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });

    if (type === 'followers') {
      const rows = await db
        .select({
          clerk_user_id: userProfiles.clerk_user_id,
          username: userProfiles.username,
          display_name: userProfiles.display_name,
          avatar_url: userProfiles.avatar_url,
          followed_at: follows.created_at,
        })
        .from(follows)
        .innerJoin(userProfiles, eq(follows.follower_id, userProfiles.clerk_user_id))
        .where(eq(follows.following_id, userId))
        .limit(limit)
        .offset(offset);
      return NextResponse.json(rows);
    }

    const rows = await db
      .select({
        clerk_user_id: userProfiles.clerk_user_id,
        username: userProfiles.username,
        display_name: userProfiles.display_name,
        avatar_url: userProfiles.avatar_url,
        followed_at: follows.created_at,
      })
      .from(follows)
      .innerJoin(userProfiles, eq(follows.following_id, userProfiles.clerk_user_id))
      .where(eq(follows.follower_id, userId))
      .limit(limit)
      .offset(offset);
    return NextResponse.json(rows);
  } catch (error) {
    console.error('Error fetching follows:', error);
    return NextResponse.json({ error: 'Failed to fetch follows' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { userId: targetId } = await request.json();
    if (!targetId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    if (targetId === userId) return NextResponse.json({ error: 'Cannot follow yourself' }, { status: 400 });

    const [inserted] = await db
      .insert(follows)
      .values({ follower_id: userId, following_id: targetId })
      .onConflictDoNothing()
      .returning();

    if (inserted) {
      await db.insert(notifications).values({ recipient_id: targetId, actor_id: userId, type: 'follow' }).catch(() => {});
      const [actor] = await db.select({ display_name: userProfiles.display_name, username: userProfiles.username }).from(userProfiles).where(eq(userProfiles.clerk_user_id, userId));
      const name = actor?.display_name || actor?.username || "Someone";
      sendPushToUser(targetId, { title: "New follower", body: `${name} started following you.`, url: "/map" }).catch(() => {});
    }

    return NextResponse.json({ message: 'Followed' });
  } catch (error) {
    console.error('Error following user:', error);
    return NextResponse.json({ error: 'Failed to follow user' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const targetId = searchParams.get('userId');
    if (!targetId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });

    await db
      .delete(follows)
      .where(and(eq(follows.follower_id, userId), eq(follows.following_id, targetId)));

    return NextResponse.json({ message: 'Unfollowed' });
  } catch (error) {
    console.error('Error unfollowing user:', error);
    return NextResponse.json({ error: 'Failed to unfollow user' }, { status: 500 });
  }
}
