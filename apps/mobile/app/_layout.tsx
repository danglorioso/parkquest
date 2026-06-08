import '../global.css';

import { useEffect } from 'react';
import { ClerkProvider, ClerkLoaded, useAuth } from '@clerk/clerk-expo';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

const tokenCache = {
  getToken: (key: string) => SecureStore.getItemAsync(key),
  saveToken: (key: string, token: string) => SecureStore.setItemAsync(key, token),
  clearToken: (key: string) => SecureStore.deleteItemAsync(key),
};

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000 } },
});

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

function AuthSync() {
  const { isSignedIn, isLoaded } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const navState = useRootNavigationState();

  useEffect(() => {
    if (!isLoaded || !navState?.key) return;
    const inAuth = segments[0] === '(auth)';
    if (isSignedIn && inAuth) router.replace('/(tabs)/home');
    if (!isSignedIn && !inAuth) router.replace('/(auth)/sign-in');
  }, [isLoaded, isSignedIn, segments, navState?.key]);

  return null;
}

export default function RootLayout() {
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <ClerkLoaded>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaProvider>
              <AuthSync />
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="(auth)" options={{ headerShown: false }} />
                <Stack.Screen name="park/[park_code]" options={{ headerShown: true, title: '', headerTintColor: '#15803d', headerStyle: { backgroundColor: '#ffffff' }, headerShadowVisible: false }} />
                <Stack.Screen name="user/[username]" options={{ headerShown: true, title: '', headerTintColor: '#15803d', headerStyle: { backgroundColor: '#ffffff' }, headerShadowVisible: false }} />
                <Stack.Screen name="badges" options={{ headerShown: true, title: 'Badges', headerTintColor: '#15803d', headerStyle: { backgroundColor: '#ffffff' }, headerShadowVisible: false }} />
                <Stack.Screen name="journal" options={{ headerShown: true, title: 'Journal', headerTintColor: '#15803d', headerStyle: { backgroundColor: '#ffffff' }, headerShadowVisible: false }} />
                <Stack.Screen name="friends" options={{ headerShown: true, title: 'Friends', headerTintColor: '#15803d', headerStyle: { backgroundColor: '#ffffff' }, headerShadowVisible: false }} />
                <Stack.Screen name="passport" options={{ headerShown: true, title: 'Passport', headerTintColor: '#15803d', headerStyle: { backgroundColor: '#ffffff' }, headerShadowVisible: false }} />
                <Stack.Screen name="notifications" options={{ headerShown: true, title: 'Notifications', headerTintColor: '#15803d', headerStyle: { backgroundColor: '#ffffff' }, headerShadowVisible: false }} />
                <Stack.Screen name="planner" options={{ headerShown: true, title: 'Trip Planner', headerTintColor: '#15803d', headerStyle: { backgroundColor: '#ffffff' }, headerShadowVisible: false }} />
              </Stack>
            </SafeAreaProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ClerkLoaded>
    </ClerkProvider>
  );
}
