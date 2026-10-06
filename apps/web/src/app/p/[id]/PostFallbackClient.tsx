'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { PublicNav } from '@/components/public/PublicNav';
import { PublicFooter } from '@/components/public/PublicFooter';
import { OpenInAppOverlay } from '@/components/OpenInAppOverlay';
import { PostCard, type FeedPost } from '@/components/PostCard';
import { isMobileBrowser } from '@/lib/device';

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
  const { isSignedIn } = useUser();
  const [post, setPost] = useState<FeedPost | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'notfound' | 'error'>('loading');
  // Mobile-only — desktop has no app to catch the parkquest:// scheme (see
  // the profile page's identical fix for why this used to break desktop
  // Safari outright).
  const [showOverlay, setShowOverlay] = useState(false);
  const attemptedOpen = useRef(false);

  const openApp = () => {
    window.location.href = `parkquest://p/${id}`;
  };

  useEffect(() => {
    if (attemptedOpen.current || !isMobileBrowser()) return;
    attemptedOpen.current = true;
    setShowOverlay(true);
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
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <PublicNav redirectTo={`/p/${id}`} />

      <div style={{ flex: 1, width: '100%', maxWidth: 560, margin: '0 auto', padding: '32px 20px 80px' }}>
        {status === 'ok' && post && (
          <PostCard post={post} onLike={handleLike} />
        )}
        {(status === 'notfound' || status === 'error') && <PostUnavailableCard />}
      </div>

      <PublicFooter />

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
