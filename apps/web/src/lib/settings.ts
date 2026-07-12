// Client-side user preferences, mirrored from the mobile app's lib/settings.
// localStorage-backed — call only from client components.

export type DefaultVisibility = 'public' | 'friends' | 'private';

const KEY = 'pq-default-visibility';
const FALLBACK: DefaultVisibility = 'friends';

export function getDefaultVisibility(): DefaultVisibility {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(KEY) : null;
    return raw === 'public' || raw === 'friends' || raw === 'private' ? raw : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

export function setDefaultVisibility(v: DefaultVisibility): void {
  try { window.localStorage.setItem(KEY, v); } catch { /* ignore */ }
}
