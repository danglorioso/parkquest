import { db } from '@/lib/db';
import { userIntegrations } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

export class StravaNotConnectedError extends Error {
  constructor() {
    super('Strava not connected');
    this.name = 'StravaNotConnectedError';
  }
}

// Refreshes tokens ahead of Strava's ~6h expiry when the stored token is
// close to (or past) expiring, so callers always get a usable access_token.
export async function getValidStravaToken(clerkUserId: string): Promise<string> {
  const [row] = await db
    .select()
    .from(userIntegrations)
    .where(and(eq(userIntegrations.clerk_user_id, clerkUserId), eq(userIntegrations.provider, 'strava')))
    .limit(1);

  if (!row) throw new StravaNotConnectedError();

  const expiresInMs = row.expires_at.getTime() - Date.now();
  if (expiresInMs > 5 * 60 * 1000) return row.access_token;

  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: row.refresh_token,
    }),
  });
  if (!res.ok) throw new Error(`Strava token refresh failed: ${res.status}`);
  const data = await res.json();

  await db
    .update(userIntegrations)
    .set({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: new Date(data.expires_at * 1000),
      updated_at: new Date(),
    })
    .where(and(eq(userIntegrations.clerk_user_id, clerkUserId), eq(userIntegrations.provider, 'strava')));

  return data.access_token;
}

export interface StravaActivity {
  id: number;
  name: string;
  type: string;
  distance: number; // meters
  moving_time: number; // seconds
  total_elevation_gain: number; // meters
  start_date: string; // ISO
  map?: { summary_polyline?: string | null };
}

export function mapActivity(a: StravaActivity) {
  return {
    id: String(a.id),
    name: a.name,
    type: a.type,
    distance_meters: a.distance,
    duration_seconds: a.moving_time,
    elevation_gain_meters: a.total_elevation_gain,
    start_date: a.start_date,
    route_polyline: a.map?.summary_polyline || null,
  };
}
