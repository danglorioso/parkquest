import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, and, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { posts, parks, userProfiles, visits, friendships } from '@/lib/db/schema';
import { deleteR2PhotosTrusted, extractPhotoUrls } from '@/lib/photoCleanup';
import { requireAdmin } from '@/lib/admin';

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
        badge_id: posts.badge_id,
        created_at: posts.created_at,
        clerk_user_id: posts.clerk_user_id,
        park_name: parks.name,
        park_image_url: parks.image_url,
        park_states: parks.states,
        is_national_park: sql<boolean>`COALESCE(${parks.is_national_park}, false)`,
        username: userProfiles.username,
        display_name: userProfiles.display_name,
        avatar_url: userProfiles.avatar_url,
        like_count: sql<number>`(SELECT COUNT(*)::int FROM likes WHERE likes.post_id = ${posts.id})`,
        comment_count: sql<number>`(SELECT COUNT(*)::int FROM comments WHERE comments.post_id = ${posts.id})`,
        liked_by_me: viewerId
          ? sql<boolean>`EXISTS(SELECT 1 FROM likes WHERE likes.post_id = ${posts.id} AND likes.user_id = ${viewerId})`
          : sql<boolean>`false`,
        visibility: sql<string>`COALESCE(${visits.visibility}, ${posts.visibility}, 'public')`,
        visit_date:             visits.visited_date,
        visit_rating:           visits.rating,
        visit_activities:       visits.activities,
        visit_weather:          visits.weather_conditions,
        visit_crowd:            visits.crowd,
        visit_difficulty:       visits.difficulty,
        visit_companion_count:  sql<number>`COALESCE(jsonb_array_length(${visits.companions}), 0)`,
        visit_companion_names:  sql<Array<{user_id: string; username: string; display_name: string | null; avatar_url: string | null}> | null>`(SELECT json_agg(json_build_object('user_id', up.clerk_user_id, 'username', up.username, 'display_name', up.display_name, 'avatar_url', up.avatar_url)) FROM user_profiles up WHERE up.clerk_user_id = ANY(SELECT jsonb_array_elements_text(${visits.companions})))`,
        visit_highlight:        visits.highlight,
        visit_title:            visits.title,
        visit_notes:            visits.notes,
        visit_would_return:     visits.would_return,
        visit_distance_meters:       visits.distance_meters,
        visit_duration_seconds:      visits.duration_seconds,
        visit_elevation_gain_meters: visits.elevation_gain_meters,
        visit_route_polyline:        visits.route_polyline,
        visit_external_source:       visits.external_source,
        visit_ordinal: sql<number>`(SELECT COUNT(*)::int FROM visits v2 WHERE v2.clerk_user_id = ${posts.clerk_user_id} AND v2.park_code = ${posts.park_code} AND v2.visited_date IS NOT NULL AND v2.is_bucket_list = false AND (v2.visited_date < ${visits.visited_date} OR (v2.visited_date = ${visits.visited_date} AND v2.id <= ${visits.id})))`,
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

    // Match the feed response shape so clients can reuse feed components
    return NextResponse.json({
      ...post,
      is_friend_post: isOwner,
      photos: Array.isArray(post.photos)
        ? (post.photos as Array<{ url: string } | string>).map(ph =>
            typeof ph === 'string' ? ph : ph.url
          )
        : null,
      visit_date: post.visit_date ? post.visit_date.toISOString() : null,
    });
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

    const admin = await requireAdmin();
    const ownershipFilter = admin ? eq(posts.id, postId) : and(eq(posts.id, postId), eq(posts.clerk_user_id, userId));

    const deleted = await db
      .delete(posts)
      .where(ownershipFilter)
      .returning();

    if (deleted.length === 0) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

    // Only clean up photos for standalone posts — a visit-linked post's photos are
    // owned by the (still-existing) visit, which keeps using them.
    if (deleted[0].visit_id == null) {
      const urls = extractPhotoUrls(deleted[0].photos);
      deleteR2PhotosTrusted(urls).catch(e => console.error('Post photo cleanup failed:', e));
    }

    return NextResponse.json({ message: 'Post deleted' });
  } catch (error) {
    console.error('Error deleting post:', error);
    return NextResponse.json({ error: 'Failed to delete post' }, { status: 500 });
  }
}
