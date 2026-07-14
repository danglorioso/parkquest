'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import Logo from '@/components/Logo';
import { OpenInAppOverlay } from '@/components/OpenInAppOverlay';
import { PostCard, type FeedPost } from '@/components/PostCard';

function PostUnavailableCard() {
  return (
    <div style={{ maxWidth: 420, margin: '80px auto', textAlign: 'center', padding: '0 24px' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🏞️</div>
      <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '2px', color: 'var(--ink-mute)' }}>
        PARKQUEST
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', margin: '10px 0 8px', letterSpacing: '-0.4px' }}>
        This post isn&apos;t available
      </h1>
      <p style={{ fontSize: 14, color: 'var(--ink-mute)', lineHeight: 1.5 }}>
        It may be private, or only visible to friends. Sign in to see if you have access, or open it in the app.
      </p>
    </div>
  );
}

export function PostFallbackClient({ id, appStoreUrl }: { id: string; appStoreUrl: string | null }) {
  const router = useRouter();
  const { isSignedIn, isLoaded } = useUser();
  const [post, setPost] = useState<FeedPost | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'notfound' | 'error'>('loading');
  const [showOverlay, setShowOverlay] = useState(true);
  const attemptedOpen = useRef(false);

  const openApp = () => {
    window.location.href = `parkquest://p/${id}`;
  };

  useEffect(() => {
    if (attemptedOpen.current) return;
    attemptedOpen.current = true;
    openApp();
  }, [id]);

  useEffect(() => {
    fetch(`/api/posts/${id}`)
      .then((r) => {
        if (r.status === 404) { setStatus('notfound'); return null; }
        if (!r.ok) { setStatus('error'); return null; }
        return r.json();
      })
      .then((data) => { if (data) { setPost(data); setStatus('ok'); } })
      .catch(() => setStatus('error'));
  }, [id]);

  const handleLike = async (postId: number, currentlyLiked: boolean) => {
    if (!isSignedIn) { router.push(`/sign-in?redirect=${encodeURIComponent(`/p/${id}`)}`); return; }
    setPost((prev) => prev ? { ...prev, liked_by_me: !currentlyLiked, like_count: prev.like_count + (currentlyLiked ? -1 : 1) } : prev);
    try {
      if (currentlyLiked) await fetch(`/api/likes?postId=${postId}`, { method: 'DELETE' });
      else await fetch('/api/likes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ postId }) });
    } catch {
      setPost((prev) => prev ? { ...prev, liked_by_me: currentlyLiked, like_count: prev.like_count + (currentlyLiked ? 1 : -1) } : prev);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(245,239,224,0.92)',
        backdropFilter: 'blur(20px) saturate(160%)',
        WebkitBackdropFilter: 'blur(20px) saturate(160%)',
        borderBottom: '0.5px solid var(--hairline)',
        padding: '0 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: 54,
      }}>
        <Logo />
        {isLoaded && !isSignedIn && (
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href={`/sign-in?redirect=${encodeURIComponent(`/p/${id}`)}`} style={{ textDecoration: 'none' }}>
              <button style={{
                background: 'transparent', border: '0.5px solid var(--hairline)',
                borderRadius: 8, padding: '7px 16px', fontSize: 13, fontWeight: 600,
                color: 'var(--ink)', cursor: 'pointer',
              }}>Sign in</button>
            </Link>
            <Link href="/sign-up" style={{ textDecoration: 'none' }}>
              <button style={{
                background: 'var(--primary)', border: 'none',
                borderRadius: 8, padding: '7px 16px', fontSize: 13, fontWeight: 700,
                color: '#FFFBF1', cursor: 'pointer',
              }}>Get started</button>
            </Link>
          </div>
        )}
      </div>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '32px 20px 80px' }}>
        {status === 'ok' && post && (
          <PostCard post={post} onLike={handleLike} />
        )}
        {(status === 'notfound' || status === 'error') && <PostUnavailableCard />}
      </div>

      {showOverlay && (
        <OpenInAppOverlay
          title="Open this post in the app"
          description="Get the full ParkQuest experience — see photos, like, comment, and follow along with friends."
          onDismiss={() => setShowOverlay(false)}
          onOpenApp={openApp}
          appStoreUrl={appStoreUrl}
        />
      )}
    </div>
  );
}
