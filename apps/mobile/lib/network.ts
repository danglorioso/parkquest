import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

/** How long startup waits for Clerk to resolve before giving up and letting
 * the user into the app with whatever's cached locally. A hung/offline
 * Clerk bootstrap otherwise has no timeout at all and stalls forever.
 * Confirmed-offline bails fast; online-but-slow (e.g. a cold start right
 * after a TestFlight update, re-hitting the network for a fresh token) gets
 * a much longer grace period so a slow bootstrap doesn't get mistaken for a
 * real signed-out state once Clerk actually resolves. */
const AUTH_LOAD_TIMEOUT_OFFLINE_MS = 2000;
const AUTH_LOAD_TIMEOUT_ONLINE_MS = 15000;

/** True unless NetInfo actively reports no connection. Treats the initial
 * "unknown" state (isInternetReachable === null) as online so the app
 * doesn't flash an offline banner before the first NetInfo event arrives. */
export function useIsOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setOnline(state.isConnected !== false && state.isInternetReachable !== false);
    });
    return unsubscribe;
  }, []);

  return online;
}

/** True once Clerk has loaded OR the online-aware bootstrap timeout has
 * elapsed, whichever comes first. */
export function useAuthBootstrapReady(isLoaded: boolean): boolean {
  const online = useIsOnline();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (isLoaded || timedOut) return;
    const ms = online ? AUTH_LOAD_TIMEOUT_ONLINE_MS : AUTH_LOAD_TIMEOUT_OFFLINE_MS;
    const t = setTimeout(() => setTimedOut(true), ms);
    return () => clearTimeout(t);
  }, [isLoaded, online, timedOut]);

  return isLoaded || timedOut;
}
