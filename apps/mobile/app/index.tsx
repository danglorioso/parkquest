import { Redirect } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';

export default function Index() {
  const { isSignedIn, isLoaded } = useAuth();
  if (!isLoaded) return null;
  return <Redirect href={isSignedIn ? '/(tabs)/feed' : '/(auth)/sign-in'} />;
}
