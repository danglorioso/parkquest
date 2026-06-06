import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { parks } from '@/lib/db/schema';
import { and, isNotNull } from 'drizzle-orm';

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
      })
      .from(parks)
      .where(
        and(
          isNotNull(parks.latitude),
          isNotNull(parks.longitude)
        )
      );

    return NextResponse.json(allParks);
  } catch (error) {
    console.error('Error fetching parks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch parks' },
      { status: 500 }
    );
  }
}

