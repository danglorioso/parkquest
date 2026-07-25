import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { AUTH_LOAD_TIMEOUT_MS } from '../lib/network';

export default function Index() {
  const { isSignedIn, isLoaded } = useAuth();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), AUTH_LOAD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, []);

  if (!isLoaded) {
    // Clerk never resolved (e.g. offline) — after a timeout, let the user
    // into the app with whatever's cached locally instead of hanging here
    // forever. AuthSync re-evaluates the route once/if Clerk does load.
    if (!timedOut) return null;
    return <Redirect href="/(tabs)/feed" />;
  }
  return <Redirect href={isSignedIn ? '/(tabs)/feed' : '/(auth)/sign-in'} />;
}
