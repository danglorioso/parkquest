import { Redirect } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { useAuthBootstrapReady } from '../lib/network';

export default function Index() {
  const { isSignedIn, isLoaded } = useAuth();
  const ready = useAuthBootstrapReady(isLoaded);

  if (!ready) return null;
  if (!isLoaded) {
    // Clerk never resolved (e.g. offline) — after the timeout, let the user
    // into the app with whatever's cached locally instead of hanging here
    // forever. AuthSync re-evaluates the route once/if Clerk does load.
    return <Redirect href="/(tabs)/feed" />;
  }
  return <Redirect href={isSignedIn ? '/(tabs)/feed' : '/(auth)/sign-in'} />;
}
