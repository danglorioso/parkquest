import { NextResponse, after } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, and, desc, notInArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { likes, posts, notifications, userProfiles } from '@/lib/db/schema';
import { sendPushToUser } from '@/lib/push';
import { getBlockedIds } from '@/lib/blocks';
import { ensureUserProfile } from '@/lib/ensureUserProfile';

export async function GET(request: Request) {
  try {
    const { userId: viewerId } = await auth();
    const { searchParams } = new URL(request.url);
    const postId = searchParams.get('postId');
    if (!postId) return NextResponse.json({ error: 'postId is required' }, { status: 400 });

    const blockedIds = viewerId ? await getBlockedIds(viewerId) : [];

    const rows = await db
      .select({
        user_id: likes.user_id,
        display_name: userProfiles.display_name,
        username: userProfiles.username,
        avatar_url: userProfiles.avatar_url,
      })
      .from(likes)
      .leftJoin(userProfiles, eq(likes.user_id, userProfiles.clerk_user_id))
      .where(
        blockedIds.length > 0
          ? and(eq(likes.post_id, Number(postId)), notInArray(likes.user_id, blockedIds))
          : eq(likes.post_id, Number(postId))
      )
      .orderBy(desc(likes.created_at))
      .limit(50);

    return NextResponse.json(rows);
  } catch (error) {
    console.error('Error fetching likes:', error);
    return NextResponse.json({ error: 'Failed to fetch likes' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await ensureUserProfile(userId);

    const { postId } = await request.json();
    if (!postId) return NextResponse.json({ error: 'postId is required' }, { status: 400 });

    const [targetPost] = await db.select({ clerk_user_id: posts.clerk_user_id }).from(posts).where(eq(posts.id, Number(postId)));
    if (targetPost) {
      const blockedIds = await getBlockedIds(userId);
      if (blockedIds.includes(targetPost.clerk_user_id)) {
        return NextResponse.json({ error: 'Cannot interact with this post' }, { status: 403 });
      }
    }

    const [inserted] = await db
      .insert(likes)
      .values({ user_id: userId, post_id: Number(postId) })
      .onConflictDoNothing()
      .returning();

    if (inserted && targetPost && targetPost.clerk_user_id !== userId) {
      await db.insert(notifications).values({ recipient_id: targetPost.clerk_user_id, actor_id: userId, type: 'like', post_id: Number(postId) }).catch(() => {});
      const [actor] = await db.select({ display_name: userProfiles.display_name, username: userProfiles.username }).from(userProfiles).where(eq(userProfiles.clerk_user_id, userId));
      const name = actor?.display_name || actor?.username || "Someone";
      // Un-awaited work dies when the serverless response returns; after() keeps
      // the function alive until the push is actually handed to Expo.
      after(() => sendPushToUser(targetPost.clerk_user_id, { title: "New like", body: `${name} liked your post.`, url: "/map" }).catch(() => {}));
    }

    return NextResponse.json({ message: 'Liked' });
  } catch (error) {
    console.error('Error liking post:', error);
    return NextResponse.json({ error: 'Failed to like post' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const postId = searchParams.get('postId');
    if (!postId) return NextResponse.json({ error: 'postId is required' }, { status: 400 });

    await db
      .delete(likes)
      .where(and(eq(likes.user_id, userId), eq(likes.post_id, Number(postId))));

    return NextResponse.json({ message: 'Unliked' });
  } catch (error) {
    console.error('Error unliking post:', error);
    return NextResponse.json({ error: 'Failed to unlike post' }, { status: 500 });
  }
}
