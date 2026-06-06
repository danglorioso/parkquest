import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { likes, posts, notifications, userProfiles } from '@/lib/db/schema';
import { sendPushToUser } from '@/lib/push';

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { postId } = await request.json();
    if (!postId) return NextResponse.json({ error: 'postId is required' }, { status: 400 });

    const [inserted] = await db
      .insert(likes)
      .values({ user_id: userId, post_id: Number(postId) })
      .onConflictDoNothing()
      .returning();

    if (inserted) {
      const [post] = await db.select({ clerk_user_id: posts.clerk_user_id }).from(posts).where(eq(posts.id, Number(postId)));
      if (post && post.clerk_user_id !== userId) {
        await db.insert(notifications).values({ recipient_id: post.clerk_user_id, actor_id: userId, type: 'like', post_id: Number(postId) }).catch(() => {});
        const [actor] = await db.select({ display_name: userProfiles.display_name, username: userProfiles.username }).from(userProfiles).where(eq(userProfiles.clerk_user_id, userId));
        const name = actor?.display_name || actor?.username || "Someone";
        sendPushToUser(post.clerk_user_id, { title: "New like", body: `${name} liked your post.`, url: "/map" }).catch(() => {});
      }
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
