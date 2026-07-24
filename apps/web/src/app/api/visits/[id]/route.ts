import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { visits, parks } from '@/lib/db/schema';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const visitId = Number(id);
    if (isNaN(visitId)) return NextResponse.json({ error: 'Invalid visit ID' }, { status: 400 });

    const [visit] = await db
      .select({
        id: visits.id,
        park_code: visits.park_code,
        park_name: parks.name,
        visited_date: visits.visited_date,
        end_date: visits.end_date,
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
        distance_meters: visits.distance_meters,
        duration_seconds: visits.duration_seconds,
        elevation_gain_meters: visits.elevation_gain_meters,
        route_polyline: visits.route_polyline,
        external_source: visits.external_source,
        external_activity_id: visits.external_activity_id,
      })
      .from(visits)
      .leftJoin(parks, eq(visits.park_code, parks.park_code))
      .where(and(eq(visits.id, visitId), eq(visits.clerk_user_id, userId)))
      .limit(1);

    if (!visit) return NextResponse.json({ error: 'Visit not found' }, { status: 404 });
    return NextResponse.json(visit);
  } catch (error) {
    console.error('Error fetching visit:', error);
    return NextResponse.json({ error: 'Failed to fetch visit' }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const visitId = Number(id);
    if (isNaN(visitId)) return NextResponse.json({ error: 'Invalid visit ID' }, { status: 400 });

    const body = await req.json();
    const set: Record<string, unknown> = { updated_at: new Date() };
    if (body.park_code !== undefined && body.park_code) {
      // One visit per user per park — reject moving onto a park that already has one
      const clash = await db
        .select({ id: visits.id })
        .from(visits)
        .where(and(eq(visits.clerk_user_id, userId), eq(visits.park_code, body.park_code)))
        .limit(1);
      if (clash.length > 0 && clash[0].id !== visitId) {
        return NextResponse.json(
          { error: 'You already have a visit logged for that park' },
          { status: 409 }
        );
      }
      set.park_code = body.park_code;
    }
    if (body.visited_date !== undefined) set.visited_date = body.visited_date ? new Date(body.visited_date) : null;
    if (body.end_date !== undefined) set.end_date = body.end_date ? new Date(body.end_date) : null;
    if (body.rating !== undefined) set.rating = body.rating;
    if (body.crowd !== undefined) set.crowd = body.crowd;
    if (body.difficulty !== undefined) set.difficulty = body.difficulty;
    if (body.weather_conditions !== undefined) set.weather_conditions = body.weather_conditions;
    if (body.activities !== undefined) set.activities = body.activities;
    if (body.companions !== undefined) set.companions = body.companions;
    if (body.would_return !== undefined) set.would_return = body.would_return;
    if (body.highlight !== undefined) set.highlight = body.highlight;
    if (body.title !== undefined) set.title = body.title;
    if (body.notes !== undefined) set.notes = body.notes;
    if (body.photos !== undefined) set.photos = body.photos;
    if (body.cover_photo !== undefined) set.cover_photo = body.cover_photo;
    if (body.visibility !== undefined) set.visibility = body.visibility;
    if (body.distance_meters !== undefined) set.distance_meters = body.distance_meters;
    if (body.duration_seconds !== undefined) set.duration_seconds = body.duration_seconds;
    if (body.elevation_gain_meters !== undefined) set.elevation_gain_meters = body.elevation_gain_meters;
    if (body.route_polyline !== undefined) set.route_polyline = body.route_polyline;
    if (body.external_source !== undefined) set.external_source = body.external_source;
    if (body.external_activity_id !== undefined) set.external_activity_id = body.external_activity_id;

    const updated = await db
      .update(visits)
      .set(set as Partial<typeof visits.$inferInsert>)
      .where(and(eq(visits.id, visitId), eq(visits.clerk_user_id, userId)))
      .returning();

    if (updated.length === 0) return NextResponse.json({ error: 'Visit not found' }, { status: 404 });
    return NextResponse.json({ message: 'Visit updated', visit: updated[0] });
  } catch (error) {
    console.error('Error updating visit:', error);
    return NextResponse.json({ error: 'Failed to update visit' }, { status: 500 });
  }
}
