import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const redirectUri = new URL('/api/integrations/strava/callback', request.url).toString();

  const url = new URL('https://www.strava.com/oauth/authorize');
  url.searchParams.set('client_id', process.env.STRAVA_CLIENT_ID!);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'activity:read_all');
  url.searchParams.set('state', userId);
  url.searchParams.set('approval_prompt', 'auto');

  return NextResponse.json({ url: url.toString() });
}
