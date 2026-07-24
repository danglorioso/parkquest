import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { userIntegrations } from '@/lib/db/schema';

const APP_REDIRECT = 'parkquest://strava-callback';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // clerk_user_id, set in /authorize
  const error = searchParams.get('error');

  if (error || !code || !state) {
    return NextResponse.redirect(`${APP_REDIRECT}?success=0`);
  }

  try {
    const res = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
      }),
    });
    if (!res.ok) throw new Error(`Strava token exchange failed: ${res.status}`);
    const data = await res.json();

    await db
      .insert(userIntegrations)
      .values({
        clerk_user_id: state,
        provider: 'strava',
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: new Date(data.expires_at * 1000),
        external_athlete_id: data.athlete?.id ? String(data.athlete.id) : null,
      })
      .onConflictDoUpdate({
        target: [userIntegrations.clerk_user_id, userIntegrations.provider],
        set: {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: new Date(data.expires_at * 1000),
          external_athlete_id: data.athlete?.id ? String(data.athlete.id) : null,
          updated_at: new Date(),
        },
      });

    return NextResponse.redirect(`${APP_REDIRECT}?success=1`);
  } catch (e) {
    console.error('Strava callback error:', e);
    return NextResponse.redirect(`${APP_REDIRECT}?success=0`);
  }
}
