import { NextResponse } from 'next/server';

// Apple App Site Association — enables iOS Universal Links for share links
// (/u/* profiles, /p/* posts).
// Served as JSON at https://parkquest.me/.well-known/apple-app-site-association.
// Only share paths are claimed so regular web routes (e.g. /profile/*) are
// never intercepted by the app.
const AASA = {
  applinks: {
    apps: [],
    details: [
      {
        // Modern (iOS 13+) and legacy keys, both included for compatibility
        appIDs: ['U8AK9PG243.com.danglorioso.parkquest'],
        appID: 'U8AK9PG243.com.danglorioso.parkquest',
        components: [{ '/': '/u/*' }, { '/': '/p/*' }],
        paths: ['/u/*', '/p/*'],
      },
    ],
  },
};

export function GET() {
  return NextResponse.json(AASA);
}
