import '../global.css';

import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useFonts } from 'expo-font';
import { PaletteProvider, STATIC, colorStr, useColors } from '../lib/palette';
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
import { StatusBar } from 'expo-status-bar';
import * as Sentry from '@sentry/react-native';
import LoadingScreen from '../components/LoadingScreen';
import { ToastHost } from '../lib/toast';

// enableNative captures native crashes (e.g. uncaught worklet exceptions —
// the SIGABRT class of crash that shows up with zero JS context in Apple's
// own crash logs) with a real JS stack attached, not just plain JS errors.
// Disabled in dev, and skipped entirely without a DSN — passing dsn: "" to
// Sentry.init (rather than not calling it at all) crashed launch, since the
// native side doesn't reliably gate on `enabled` before parsing the DSN.
if (!__DEV__ && process.env.EXPO_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    enableNative: true,
    tracesSampleRate: 0.2,
  });
}

// Without a handler iOS silently drops pushes that arrive while the app is
// foregrounded (e.g. badge-earned right after logging a visit).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const tokenCache = {
  getToken: (key: string) => SecureStore.getItemAsync(key),
  saveToken: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  clearToken: (key: string) => SecureStore.deleteItemAsync(key),
};

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
            const res = await fetch(`${apiBase}/api/push-tokens`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
              body: JSON.stringify({ token: tokenData.data }),
            });
            if (!res.ok) console.warn('[push] token registration rejected by server', res.status);
          }
        } catch (err) {
          // Also fires on the simulator (no APNs token available) — expected there.
          console.warn('[push] failed to register push token', err);
        }
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

function RootStack() {
  const T = useColors();
  const HEADER = {
    headerShown: true,
    headerStyle: { backgroundColor: colorStr(STATIC.bg) },
    headerTitleStyle: { color: colorStr(STATIC.ink) },
    headerTintColor: T.primary,
    headerShadowVisible: false,
  };
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: STATIC.bg } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false, headerBackTitle: '' }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen
        name="(modals)/log-visit"
        options={{
          presentation: 'modal',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="profile/edit"
        // No back-title label — Settings is reachable from more than just Profile
        // (e.g. the feed), so a fixed "Profile" label would be wrong half the time.
        options={{ ...HEADER, title: 'Settings', headerBackTitle: '' }}
      />
      <Stack.Screen
        name="profile/security"
        options={{ ...HEADER, title: 'Sign-in & Security', headerBackTitle: 'Settings' }}
      />
      <Stack.Screen
        name="profile/moderation"
        options={{ ...HEADER, title: 'Privacy & Moderation', headerBackTitle: 'Settings' }}
      />
      <Stack.Screen
        name="user/[id]"
        options={{ ...HEADER, headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="admin/index"
        options={{ ...HEADER, title: 'Admin', headerBackTitle: 'Profile' }}
      />
      <Stack.Screen
        name="admin/reports"
        options={{ ...HEADER, title: 'Reports', headerBackTitle: 'Admin' }}
      />
      <Stack.Screen
        name="admin/users"
        options={{ ...HEADER, title: 'Users', headerBackTitle: 'Admin' }}
      />
      <Stack.Screen
        name="admin/posts"
        options={{ ...HEADER, title: 'Posts', headerBackTitle: 'Admin' }}
      />
      <Stack.Screen
        name="admin/visits"
        options={{ ...HEADER, title: 'Visits', headerBackTitle: 'Admin' }}
      />
      <Stack.Screen
        name="admin/badges"
        options={{ ...HEADER, title: 'Badges', headerBackTitle: 'Admin' }}
      />
      <Stack.Screen
        name="admin/parks"
        options={{ ...HEADER, title: 'Parks', headerBackTitle: 'Admin' }}
      />
    </Stack>
  );
}

function RootLayout() {
  const [appReady, setAppReady] = useState(false);

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <PaletteProvider>
          <SafeAreaProvider>
            <StatusBar style="auto" />
            <SplashController onReady={() => setAppReady(true)} />
            <ClerkLoaded>
              <AuthSync />
              <RootStack />
            </ClerkLoaded>
            <LoadingScreen visible={!appReady} />
            <ToastHost />
          </SafeAreaProvider>
          </PaletteProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default Sentry.wrap(RootLayout);
