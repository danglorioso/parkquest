import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, and, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { posts, parks, userProfiles, visits, friendships } from '@/lib/db/schema';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const postId = Number(id);
    if (isNaN(postId)) return NextResponse.json({ error: 'Invalid post ID' }, { status: 400 });

    const body = await req.json();
    const set: Partial<typeof posts.$inferInsert> = { updated_at: new Date() };
    if ('caption' in body) {
      set.caption = typeof body.caption === 'string' ? body.caption || null : null;
    }
    if ('photos' in body) {
      set.photos = Array.isArray(body.photos) && body.photos.length > 0 ? body.photos : null;
    }
    if ('park_code' in body) {
      set.park_code = typeof body.park_code === 'string' && body.park_code ? body.park_code : null;
    }
    if ('visibility' in body) {
      if (!['public', 'friends', 'private'].includes(body.visibility)) {
        return NextResponse.json({ error: 'Invalid visibility' }, { status: 400 });
      }
      set.visibility = body.visibility;
    }

    const updated = await db
      .update(posts)
      .set(set)
      .where(and(eq(posts.id, postId), eq(posts.clerk_user_id, userId)))
      .returning();

    if (updated.length === 0) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    return NextResponse.json({ message: 'Post updated' });
  } catch (error) {
    console.error('Error updating post:', error);
    return NextResponse.json({ error: 'Failed to update post' }, { status: 500 });
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: viewerId } = await auth();
    const { id } = await params;
    const postId = Number(id);
    if (isNaN(postId)) return NextResponse.json({ error: 'Invalid post ID' }, { status: 400 });

    const [post] = await db
      .select({
        id: posts.id,
        caption: posts.caption,
        photos: posts.photos,
        park_code: posts.park_code,
        visit_id: posts.visit_id,
        created_at: posts.created_at,
        clerk_user_id: posts.clerk_user_id,
        park_name: parks.name,
        username: userProfiles.username,
        display_name: userProfiles.display_name,
        avatar_url: userProfiles.avatar_url,
        like_count: sql<number>`(SELECT COUNT(*)::int FROM likes WHERE likes.post_id = ${posts.id})`,
        comment_count: sql<number>`(SELECT COUNT(*)::int FROM comments WHERE comments.post_id = ${posts.id})`,
        liked_by_me: viewerId
          ? sql<boolean>`EXISTS(SELECT 1 FROM likes WHERE likes.post_id = ${posts.id} AND likes.user_id = ${viewerId})`
          : sql<boolean>`false`,
        visibility: sql<string>`COALESCE(${visits.visibility}, ${posts.visibility}, 'public')`,
      })
      .from(posts)
      .leftJoin(parks, eq(posts.park_code, parks.park_code))
      .leftJoin(userProfiles, eq(posts.clerk_user_id, userProfiles.clerk_user_id))
      .leftJoin(visits, eq(posts.visit_id, visits.id))
      .where(eq(posts.id, postId))
      .limit(1);

    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

    // Visibility gate — 404 (not 403) so post existence isn't leaked
    const isOwner = viewerId != null && viewerId === post.clerk_user_id;
    if (!isOwner && post.visibility === 'private') {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }
    if (!isOwner && post.visibility === 'friends') {
      if (!viewerId) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
      const [friendship] = await db
        .select({ id: friendships.id })
        .from(friendships)
        .where(and(
          eq(friendships.status, 'accepted'),
          or(
            and(eq(friendships.requester_id, viewerId), eq(friendships.recipient_id, post.clerk_user_id)),
            and(eq(friendships.requester_id, post.clerk_user_id), eq(friendships.recipient_id, viewerId)),
          )
        ))
        .limit(1);
      if (!friendship) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    return NextResponse.json(post);
  } catch (error) {
    console.error('Error fetching post:', error);
    return NextResponse.json({ error: 'Failed to fetch post' }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const postId = Number(id);
    if (isNaN(postId)) return NextResponse.json({ error: 'Invalid post ID' }, { status: 400 });

    const deleted = await db
      .delete(posts)
      .where(and(eq(posts.id, postId), eq(posts.clerk_user_id, userId)))
      .returning();

    if (deleted.length === 0) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    return NextResponse.json({ message: 'Post deleted' });
  } catch (error) {
    console.error('Error deleting post:', error);
    return NextResponse.json({ error: 'Failed to delete post' }, { status: 500 });
  }
}
