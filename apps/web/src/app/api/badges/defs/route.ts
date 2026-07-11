import { NextResponse } from 'next/server';
import { getBadgeDisplayMap } from '@/lib/badgeDefs';

// Display info (id/name/description/emoji/tier) for every badge, static and
// custom. Public: contains no user data — clients use it to render badge
// share posts for admin-defined badges they don't know statically.
export async function GET() {
  try {
    const map = await getBadgeDisplayMap();
    return NextResponse.json(
      { badges: Array.from(map.values()) },
      { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' } },
    );
  } catch (error) {
    console.error('Error fetching badge defs:', error);
    return NextResponse.json({ error: 'Failed to fetch badge defs' }, { status: 500 });
  }
}
