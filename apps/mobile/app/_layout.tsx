import '../global.css';

import { useEffect, useRef, useState } from 'react';
import { useFonts } from 'expo-font';
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_600SemiBold,
  JetBrainsMono_700Bold,
} from '@expo-google-fonts/jetbrains-mono';
import { ClerkProvider, ClerkLoaded, useAuth } from '@clerk/clerk-expo';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as WebBrowser from 'expo-web-browser';
import * as SplashScreen from 'expo-splash-screen';
import LoadingScreen from '../components/LoadingScreen';

SplashScreen.preventAutoHideAsync();

WebBrowser.maybeCompleteAuthSession();

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
      SplashScreen.hideAsync();
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
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ClerkProvider>
  );
}
