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
