import Link from 'next/link';

// Universal Link fallback for shared posts. On iOS devices with ParkQuest
// installed the app intercepts /p/* and opens the post directly; everyone
// else lands here. Post content is not rendered — posts can be
// friends-only, and this page is public.

// TODO: set once the app is live on the App Store
const APP_STORE_URL: string | null = null;

export default function SharedPostPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#F2EBDB',
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 420,
          width: '100%',
          background: '#FFFBF1',
          border: '1px solid rgba(27,26,22,0.10)',
          borderRadius: 20,
          padding: '40px 32px',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 12 }}>🏞️</div>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '2px', color: '#7A746A' }}>
          PARKQUEST
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1B1A16', margin: '10px 0 8px', letterSpacing: '-0.5px' }}>
          This post lives in the app
        </h1>
        <p style={{ fontSize: 14, color: '#7A746A', lineHeight: 1.5, margin: '0 0 24px' }}>
          Download ParkQuest to see this post, log your own park visits, and
          follow friends&apos; adventures.
        </p>

        {APP_STORE_URL ? (
          <a
            href={APP_STORE_URL}
            style={{
              display: 'inline-block',
              background: '#1F3D2E',
              color: '#FFFBF1',
              fontWeight: 700,
              fontSize: 14,
              padding: '13px 28px',
              borderRadius: 12,
              textDecoration: 'none',
            }}
          >
            Get ParkQuest on the App Store
          </a>
        ) : (
          <div
            style={{
              display: 'inline-block',
              background: 'rgba(31,61,46,0.08)',
              color: '#1F3D2E',
              fontWeight: 700,
              fontSize: 14,
              padding: '13px 28px',
              borderRadius: 12,
            }}
          >
            Coming soon to the App Store
          </div>
        )}

        <div style={{ marginTop: 20 }}>
          <Link href="/parks" style={{ fontSize: 13, color: '#7A746A', textDecoration: 'none', fontWeight: 600 }}>
            Explore national parks on the web →
          </Link>
        </div>
      </div>
    </div>
  );
}
