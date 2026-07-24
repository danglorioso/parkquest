import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getValidStravaToken, mapActivity, StravaNotConnectedError, type StravaActivity } from '@/lib/strava';

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date'); // 'YYYY-MM-DD'

  try {
    const token = await getValidStravaToken(userId);

    const url = new URL('https://www.strava.com/api/v3/athlete/activities');
    if (date) {
      // Widen a full calendar day by 12h on each side so activities logged
      // near midnight in the user's local timezone still turn up.
      const dayStart = new Date(`${date}T00:00:00Z`);
      const after = Math.floor(dayStart.getTime() / 1000) - 12 * 3600;
      const before = Math.floor(dayStart.getTime() / 1000) + 36 * 3600;
      url.searchParams.set('after', String(after));
      url.searchParams.set('before', String(before));
      url.searchParams.set('per_page', '30');
    } else {
      url.searchParams.set('per_page', '10');
    }

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Strava activities fetch failed: ${res.status}`);
    const activities: StravaActivity[] = await res.json();

    return NextResponse.json(activities.map(mapActivity));
  } catch (e) {
    if (e instanceof StravaNotConnectedError) {
      return NextResponse.json({ error: 'not_connected' }, { status: 409 });
    }
    console.error('Error fetching Strava activities:', e);
    return NextResponse.json({ error: 'Failed to fetch activities' }, { status: 500 });
  }
}
