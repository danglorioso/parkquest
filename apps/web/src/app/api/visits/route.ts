import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { visits, parks, friendships, notifications, posts } from '@/lib/db/schema';
import { auth } from '@clerk/nextjs/server';
import { eq, and, desc, or, sql } from 'drizzle-orm';
import { deleteR2PhotosTrusted, extractPhotoUrls } from '@/lib/photoCleanup';
import { ensureUserProfile } from '@/lib/ensureUserProfile';

async function notifyFriendsOfVisit(userId: string, visitId: number, park_code: string) {
  const friends = await db
    .select({
      friend_id: sql<string>`CASE WHEN ${friendships.requester_id} = ${userId} THEN ${friendships.recipient_id} ELSE ${friendships.requester_id} END`,
    })
    .from(friendships)
    .where(
      and(
        or(eq(friendships.requester_id, userId), eq(friendships.recipient_id, userId)),
        eq(friendships.status, 'accepted')
      )
    );
  if (friends.length === 0) return;
  await db.insert(notifications).values(
    friends.map(({ friend_id }) => ({
      recipient_id: friend_id,
      actor_id: userId,
      type: 'visit_logged' as const,
      visit_id: visitId,
      park_code,
    }))
  );
}

export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userVisits = await db
      .select({
        id: visits.id,
        park_code: visits.park_code,
        park_name: parks.name,
        states: parks.states,
        latitude: parks.latitude,
        longitude: parks.longitude,
        stamp_glyph: parks.stamp_glyph,
        visited_date: visits.visited_date,
        end_date: visits.end_date,
        is_bucket_list: visits.is_bucket_list,
        rating: visits.rating,
        crowd: visits.crowd,
        difficulty: visits.difficulty,
        weather_conditions: visits.weather_conditions,
        activities: visits.activities,
        companions: visits.companions,
        would_return: visits.would_return,
        highlight: visits.highlight,
        title: visits.title,
        notes: visits.notes,
        photos: visits.photos,
        cover_photo: visits.cover_photo,
        visibility: visits.visibility,
        created_at: visits.created_at,
      })
      .from(visits)
      .leftJoin(parks, eq(visits.park_code, parks.park_code))
      .where(eq(visits.clerk_user_id, userId))
      .orderBy(desc(visits.visited_date));

    return NextResponse.json(userVisits);
  } catch (error) {
    console.error('Error fetching visits:', error);
    return NextResponse.json({ error: 'Failed to fetch visits' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    await ensureUserProfile(userId);

    const body = await request.json();
    const {
      park_code, is_bucket_list, visited_date, end_date,
      rating, crowd, difficulty, weather_conditions, activities,
      companions, would_return, highlight, title, notes, photos, cover_photo, visibility,
    } = body;

    if (!park_code) {
      return NextResponse.json({ error: 'Park code is required' }, { status: 400 });
    }

    const isBucketList = is_bucket_list === true;
    const visitDate = visited_date ? new Date(visited_date) : (isBucketList ? null : new Date());
    const endDate = end_date ? new Date(end_date) : null;
    const visitVisibility = visibility || 'private';

    const existingVisit = await db
      .select()
      .from(visits)
      .where(and(eq(visits.clerk_user_id, userId), eq(visits.park_code, park_code)))
      .limit(1);

    if (existingVisit.length > 0) {
      const existing = existingVisit[0];
      if (isBucketList && !existing.is_bucket_list) {
        const updated = await db
          .update(visits)
          .set({ is_bucket_list: true, visited_date: null as unknown as Date, end_date: null as unknown as Date })
          .where(eq(visits.id, existing.id))
          .returning();
        return NextResponse.json({ message: 'Park added to bucket list', visit: updated[0] });
      }
      if (!isBucketList) {
        const updated = await db
          .update(visits)
          .set({
            is_bucket_list: false,
            visited_date: visitDate as Date,
            end_date: endDate as Date,
            rating: rating !== undefined ? rating : existing.rating,
            crowd: crowd !== undefined ? crowd : existing.crowd,
            difficulty: difficulty !== undefined ? difficulty : existing.difficulty,
            weather_conditions: weather_conditions !== undefined ? weather_conditions : existing.weather_conditions,
            activities: activities !== undefined ? activities : existing.activities,
            companions: companions !== undefined ? companions : existing.companions,
            would_return: would_return !== undefined ? would_return : existing.would_return,
            highlight: highlight !== undefined ? highlight : existing.highlight,
            title: title !== undefined ? title : existing.title,
            notes: notes !== undefined ? notes : existing.notes,
            photos: photos !== undefined ? photos : existing.photos,
            cover_photo: cover_photo !== undefined ? cover_photo : existing.cover_photo,
            visibility: visitVisibility,
            updated_at: new Date(),
          })
          .where(eq(visits.id, existing.id))
          .returning();
        const wasConverted = existing.is_bucket_list;
        if (wasConverted && visitVisibility !== 'private') {
          notifyFriendsOfVisit(userId, existing.id, park_code).catch(() => {});
        }
        return NextResponse.json({
          message: wasConverted ? 'Park marked as visited' : 'Visit updated',
          visit: updated[0],
        });
      }
      return NextResponse.json({ message: 'Park already in bucket list', visit: existing });
    }

    const newVisit = await db
      .insert(visits)
      .values({
        clerk_user_id: userId,
        park_code,
        visited_date: visitDate as any,
        end_date: endDate as Date | null,
        is_bucket_list: isBucketList,
        rating: rating || null,
        crowd: crowd || null,
        difficulty: difficulty || null,
        weather_conditions: weather_conditions || null,
        activities: activities || null,
        companions: companions || null,
        would_return: would_return || null,
        highlight: highlight || null,
        title: title || null,
        notes: notes || null,
        photos: photos || null,
        cover_photo: cover_photo || null,
        visibility: isBucketList ? 'private' : visitVisibility,
      })
      .returning();

    if (!isBucketList && visitVisibility !== 'private') {
      notifyFriendsOfVisit(userId, newVisit[0].id, park_code).catch(() => {});
    }

    return NextResponse.json({
      message: isBucketList ? 'Park added to bucket list' : 'Park marked as visited',
      visit: newVisit[0],
    });
  } catch (error) {
    console.error('Error marking park as visited:', error);
    return NextResponse.json({ error: 'Failed to mark park as visited' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const park_code = searchParams.get('park_code');
    // Set when this delete is really a "move this visit to a different park" step
    // (edit flow deletes the old park_code row after re-creating it under the new
    // one, reusing the same photos) — a true delete-this-entry action never sets it.
    const skipPhotoCleanup = searchParams.get('skip_photo_cleanup') === '1';

    if (!park_code) {
      return NextResponse.json({ error: 'Park code is required' }, { status: 400 });
    }

    const [visit] = await db
      .select({ id: visits.id, photos: visits.photos, cover_photo: visits.cover_photo })
      .from(visits)
      .where(and(eq(visits.clerk_user_id, userId), eq(visits.park_code, park_code)))
      .limit(1);

    await db
      .delete(visits)
      .where(and(eq(visits.clerk_user_id, userId), eq(visits.park_code, park_code)));

    if (visit && !skipPhotoCleanup) {
      // If a post still points at this visit, it survives the delete (visit_id -> null
      // via the FK) and keeps using these same photos — leave storage alone in that case.
      const [linkedPost] = await db
        .select({ id: posts.id })
        .from(posts)
        .where(eq(posts.visit_id, visit.id))
        .limit(1);
      if (!linkedPost) {
        const urls = [...extractPhotoUrls(visit.photos), ...(visit.cover_photo ? [visit.cover_photo] : [])];
        deleteR2PhotosTrusted(urls).catch(e => console.error('Visit photo cleanup failed:', e));
      }
    }

    return NextResponse.json({ message: 'Visit removed successfully' });
  } catch (error) {
    console.error('Error removing visit:', error);
    return NextResponse.json({ error: 'Failed to remove visit' }, { status: 500 });
  }
}
