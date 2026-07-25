import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

/** How long startup waits for Clerk to resolve before giving up and letting
 * the user into the app with whatever's cached locally. A hung/offline
 * Clerk bootstrap otherwise has no timeout at all and stalls forever. */
export const AUTH_LOAD_TIMEOUT_MS = 5000;

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
