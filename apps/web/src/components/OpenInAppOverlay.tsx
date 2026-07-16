'use client';

export function OpenInAppOverlay({
  title, description, onDismiss, onOpenApp, appStoreUrl,
}: {
  title: string;
  description: string;
  onDismiss: () => void;
  onOpenApp: () => void;
  appStoreUrl: string | null;
}) {
  return (
    <div
      onClick={onDismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 380, width: '100%',
          background: 'var(--surface)',
          border: '1px solid var(--hairline)',
          borderRadius: 20,
          padding: '36px 28px 28px',
          textAlign: 'center',
          position: 'relative',
          boxShadow: '0 24px 64px rgba(0,0,0,0.22)',
        }}
      >
        <button
          onClick={onDismiss}
          aria-label="Continue on web"
          style={{
            position: 'absolute', top: 14, right: 14,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--ink-mute)', fontSize: 18, lineHeight: 1, padding: 4,
          }}
        >
          ×
        </button>

        <div style={{ fontSize: 40, marginBottom: 10 }}>🏞️</div>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '2px', color: 'var(--ink-mute)' }}>
          PARKQUEST
        </div>
        <h1 style={{ fontSize: 21, fontWeight: 800, color: 'var(--ink)', margin: '10px 0 8px', letterSpacing: '-0.4px' }}>
          {title}
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--ink-mute)', lineHeight: 1.5, margin: '0 0 22px' }}>
          {description}
        </p>

        <button
          onClick={onOpenApp}
          style={{
            display: 'block', width: '100%',
            background: 'var(--primary)', color: '#FFFBF1',
            fontWeight: 700, fontSize: 14,
            padding: '13px 28px', borderRadius: 12,
            border: 'none', cursor: 'pointer', marginBottom: 12,
          }}
        >
          Open in App
        </button>

        {appStoreUrl ? (
          <a
            href={appStoreUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'block', width: '100%', boxSizing: 'border-box',
              background: 'transparent', color: 'var(--primary)',
              fontWeight: 700, fontSize: 14,
              padding: '13px 28px', borderRadius: 12,
              border: '1.5px solid var(--primary)',
              textDecoration: 'none', marginBottom: 12,
            }}
          >
            Download on the App Store
          </a>
        ) : (
          <div style={{ fontSize: 11.5, color: 'var(--ink-mute)', marginBottom: 12 }}>
            Don&apos;t have ParkQuest yet? Search &quot;ParkQuest&quot; on the App Store.
          </div>
        )}

        <button
          onClick={onDismiss}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 13, color: 'var(--ink-mute)', fontWeight: 600,
            textDecoration: 'underline',
          }}
        >
          Continue on web
        </button>
      </div>
    </div>
  );
}
