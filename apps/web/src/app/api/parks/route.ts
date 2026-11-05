import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { parks } from '@/lib/db/schema';
import { and, isNotNull } from 'drizzle-orm';

export const revalidate = 86400;

export async function GET() {
  try {
    const allParks = await db
      .select({
        park_code: parks.park_code,
        name: parks.name,
        states: parks.states,
        latitude: parks.latitude,
        longitude: parks.longitude,
        description: parks.description,
        image_url: parks.image_url,
        stamp_glyph: parks.stamp_glyph,
        is_national_park: parks.is_national_park,
        designation: parks.designation,
      })
      .from(parks)
      .where(
        and(
          isNotNull(parks.latitude),
          isNotNull(parks.longitude)
        )
      );

    // A day of client caching is fine for park adds/redesignations — they
    // don't need to show up instantly. Admin park writes revalidate the server
    // copy (revalidateParkData), so they land within this one window.
    return NextResponse.json(allParks, {
      headers: { 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600' },
    });
  } catch (error) {
    console.error('Error fetching parks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch parks' },
      { status: 500 }
    );
  }
}

