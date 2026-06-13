import '../global.css';

import { useEffect, useRef, useState } from 'react';
import { useFonts } from 'expo-font';
import { PaletteProvider } from '../lib/palette';
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_600SemiBold,
  JetBrainsMono_700Bold,
} from '@expo-google-fonts/jetbrains-mono';
import { ClerkProvider, ClerkLoaded, useAuth } from '@clerk/clerk-expo';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import LoadingScreen from '../components/LoadingScreen';

const tokenCache = (() => {
  const cache = new Map<string, string>();
  return {
    getToken: async (key: string) => cache.get(key) ?? null,
    saveToken: async (key: string, token: string) => { cache.set(key, token); },
    clearToken: async (key: string) => { cache.delete(key); },
  };
})();

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000 } },
});

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

function AuthSync() {
  const { isSignedIn, isLoaded } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const wasSignedIn = useRef(false);

  useEffect(() => {
    if (!isLoaded || (segments as string[]).length === 0) return;
    if (isSignedIn) wasSignedIn.current = true;
    const inAuth = segments[0] === '(auth)';
    if (isSignedIn && inAuth) router.replace('/(tabs)/feed');
    if (!isSignedIn && !inAuth && !wasSignedIn.current) router.replace('/(auth)/sign-in');
  }, [isLoaded, isSignedIn, segments]);

  return null;
}

function SplashController({ onReady }: { onReady: () => void }) {
  const { isLoaded: clerkLoaded } = useAuth();
  const [fontsLoaded] = useFonts({
    JetBrainsMono_400Regular,
    JetBrainsMono_600SemiBold,
    JetBrainsMono_700Bold,
  });

  useEffect(() => {
    if (clerkLoaded && fontsLoaded) {
      onReady();
    }
  }, [clerkLoaded, fontsLoaded]);

  return null;
}

export default function RootLayout() {
  const [appReady, setAppReady] = useState(false);

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <PaletteProvider>
          <SafeAreaProvider>
            <SplashController onReady={() => setAppReady(true)} />
            <ClerkLoaded>
              <AuthSync />
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="(auth)" options={{ headerShown: false }} />
                <Stack.Screen
                  name="(modals)/log-visit"
                  options={{
                    presentation: 'modal',
                    headerShown: false,
                  }}
                />
                <Stack.Screen
                  name="parks/[id]"
                  options={{ headerShown: false }}
                />
                <Stack.Screen
                  name="user/[id]"
                  options={{
                    headerShown: true,
                    headerStyle: { backgroundColor: '#F2EBDB' },
                    headerTintColor: '#1F3D2E',
                    headerShadowVisible: false,
                    headerBackTitle: 'Back',
                  }}
                />
              </Stack>
            </ClerkLoaded>
            <LoadingScreen visible={!appReady} />
          </SafeAreaProvider>
          </PaletteProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ClerkProvider>
  );
}
