import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, asc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { comments, userProfiles, posts, notifications } from '@/lib/db/schema';
import { sendPushToUser } from '@/lib/push';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const postId = searchParams.get('postId');
    if (!postId) return NextResponse.json({ error: 'postId is required' }, { status: 400 });

    const rows = await db
      .select({
        id: comments.id,
        content: comments.content,
        created_at: comments.created_at,
        user_id: comments.user_id,
        username: userProfiles.username,
        display_name: userProfiles.display_name,
        avatar_url: userProfiles.avatar_url,
      })
      .from(comments)
      .leftJoin(userProfiles, eq(comments.user_id, userProfiles.clerk_user_id))
      .where(eq(comments.post_id, Number(postId)))
      .orderBy(asc(comments.created_at));

    return NextResponse.json(rows);
  } catch (error) {
    console.error('Error fetching comments:', error);
    return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { postId, content } = await request.json();
    if (!postId || !content?.trim()) {
      return NextResponse.json({ error: 'postId and content are required' }, { status: 400 });
    }

    const [comment] = await db
      .insert(comments)
      .values({ user_id: userId, post_id: Number(postId), content: content.trim() })
      .returning();

    const [post] = await db.select({ clerk_user_id: posts.clerk_user_id }).from(posts).where(eq(posts.id, Number(postId)));
    if (post && post.clerk_user_id !== userId) {
      await db.insert(notifications).values({ recipient_id: post.clerk_user_id, actor_id: userId, type: 'comment', post_id: Number(postId), metadata: { excerpt: content.trim().slice(0, 100) } }).catch(() => {});
      const [actor] = await db.select({ display_name: userProfiles.display_name, username: userProfiles.username }).from(userProfiles).where(eq(userProfiles.clerk_user_id, userId));
      const name = actor?.display_name || actor?.username || "Someone";
      sendPushToUser(post.clerk_user_id, { title: "New comment", body: `${name}: ${content.trim().slice(0, 80)}`, url: "/map" }).catch(() => {});
    }

    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    console.error('Error adding comment:', error);
    return NextResponse.json({ error: 'Failed to add comment' }, { status: 500 });
  }
}
