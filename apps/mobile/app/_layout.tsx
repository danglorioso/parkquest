import '../global.css';

import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
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
import * as Notifications from 'expo-notifications';
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
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const wasSignedIn = useRef(false);
  const pushRequested = useRef(false);

  useEffect(() => {
    if (!isLoaded || (segments as string[]).length === 0) return;
    if (isSignedIn) wasSignedIn.current = true;
    const inAuth = segments[0] === '(auth)';
    if (isSignedIn && inAuth) router.replace('/(tabs)/feed');
    if (!isSignedIn && !inAuth && !wasSignedIn.current) router.replace('/(auth)/sign-in');
  }, [isLoaded, isSignedIn, segments]);

  useEffect(() => {
    if (!isSignedIn || pushRequested.current) return;
    pushRequested.current = true;

    const registerPush = async () => {
      const { status } = await Notifications.getPermissionsAsync();
      const finalStatus = status === 'undetermined'
        ? (await Notifications.requestPermissionsAsync()).status
        : status;
      if (finalStatus !== 'granted') return;

      // Expo push tokens only work on physical devices
      if (Platform.OS === 'ios' && !Platform.isPad) {
        try {
          const projectId = process.env.EXPO_PUBLIC_PROJECT_ID;
          const tokenData = await Notifications.getExpoPushTokenAsync(
            projectId ? { projectId } : undefined
          );
          const apiBase = process.env.EXPO_PUBLIC_API_URL ?? '';
          const tok = await getToken();
          if (tok) {
            fetch(`${apiBase}/api/push-tokens`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
              body: JSON.stringify({ token: tokenData.data }),
            }).catch(() => {});
          }
        } catch { /* simulator or missing projectId — ignore */ }
      }
    };

    registerPush();
  }, [isSignedIn]);

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
