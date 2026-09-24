import { useEffect, useState } from 'react';
import { useIsOnline } from './network';

/** How long the splash waits for the feed's first page before giving up and
 * handing off anyway — mirrors useAuthBootstrapReady's online-aware timeout
 * so a hung/slow first fetch can't stall launch forever, while still giving
 * a real network request a fair chance to land before the splash lifts. */
const FEED_READY_TIMEOUT_OFFLINE_MS = 2000;
const FEED_READY_TIMEOUT_ONLINE_MS = 8000;

type Listener = () => void;
let ready = false;
const listeners = new Set<Listener>();

/** Call once the feed screen's first page has resolved — success, error, or
 * an offline/cached fallback all count, since any of those leaves the
 * screen with real content instead of an empty skeleton. */
export function markFeedReady() {
  if (ready) return;
  ready = true;
  listeners.forEach(l => l());
}

/** True once the feed's first load has resolved OR the bootstrap timeout
 * elapses, whichever comes first. */
export function useFeedBootstrapReady(): boolean {
  const online = useIsOnline();
  const [isReady, setIsReady] = useState(ready);

  useEffect(() => {
    if (ready) { setIsReady(true); return; }
    const onReady = () => setIsReady(true);
    listeners.add(onReady);
    const ms = online ? FEED_READY_TIMEOUT_ONLINE_MS : FEED_READY_TIMEOUT_OFFLINE_MS;
    const t = setTimeout(onReady, ms);
    return () => { listeners.delete(onReady); clearTimeout(t); };
  }, [online]);

  return isReady;
}
