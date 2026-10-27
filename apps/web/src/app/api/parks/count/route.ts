import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { parks } from '@/lib/db/schema';

// Backs useNationalParkCount() — marketing copy reads the live count instead
// of hardcoding it, so a redesignation (Chiricahua → 64th) needs no deploy.
// Admin park edits revalidate this path (see revalidateParkData).
export const revalidate = 86400;

export async function GET() {
  try {
    const [row] = await db
      .select({ national_parks: sql<number>`count(*) filter (where ${parks.is_national_park})::int` })
      .from(parks);
    return NextResponse.json(row, {
      headers: { 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600' },
    });
  } catch (error) {
    console.error('Error counting parks:', error);
    return NextResponse.json({ error: 'Failed to count parks' }, { status: 500 });
  }
}
