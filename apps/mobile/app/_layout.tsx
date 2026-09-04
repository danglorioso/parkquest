import '../global.css';

import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useFonts } from 'expo-font';
import { PaletteProvider, STATIC, colorStr, useColors } from '../lib/palette';
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_600SemiBold,
  JetBrainsMono_700Bold,
} from '@expo-google-fonts/jetbrains-mono';
import { ClerkProvider, useAuth, useUser } from '@clerk/clerk-expo';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import * as Sentry from '@sentry/react-native';
import LoadingScreen from '../components/LoadingScreen';
import { ToastHost } from '../lib/toast';
import { PinchZoomHost } from '../lib/pinchZoom';
import { ImageLightboxHost } from '../lib/imageLightbox';
import { useAuthBootstrapReady } from '../lib/network';
import { syncLastAccountProfile, type AuthStrategy } from '../lib/lastAccount';

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
  const { user } = useUser();
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

  // Keeps the device's "quick sign back in" snapshot (landing screen) fresh
  // whenever a live session is confirmed — self-heals if a sign-in call site
  // didn't get to tag its strategy (e.g. app killed mid-flow).
  useEffect(() => {
    if (!isSignedIn || !user) return;
    const fallbackStrategy: AuthStrategy = user.passwordEnabled
      ? 'password'
      : user.verifiedExternalAccounts?.some(a => a.provider === 'apple')
      ? 'apple'
      : user.verifiedExternalAccounts?.some(a => a.provider === 'google')
      ? 'google'
      : 'password';
    syncLastAccountProfile({
      userId: user.id,
      name: [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.username || null,
      username: user.username ?? null,
      email: user.primaryEmailAddress?.emailAddress ?? null,
      avatarUrl: user.imageUrl ?? null,
      fallbackStrategy,
    });
  }, [isSignedIn, user?.id]);

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
  // Clerk's initial bootstrap hits the network with no timeout of its own —
  // offline (or a hung request), clerkLoaded never flips true and the splash
  // would sit forever. useAuthBootstrapReady proceeds without it once its
  // (online-aware) timeout elapses; the app falls back to cached offline
  // data and AuthSync re-evaluates once/if Clerk does finish loading.
  const authReady = useAuthBootstrapReady(clerkLoaded);

  useEffect(() => {
    if (authReady && fontsLoaded) {
      onReady();
    }
  }, [authReady, fontsLoaded]);

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
      {/* No park-sheet/[id] route — the map-dot park sheet is rendered
          inline inside (tabs)/map.tsx (see ParkProfileScreen there) rather
          than presented as its own screen. It used to be one, through
          three abandoned designs (two native-formSheet attempts, then a
          transparentModal wrapping the same custom Animated+PanResponder
          sheet built for this) — see the long comment above ParkDetailRoute
          in park/[id].tsx for the full history and why even the
          transparentModal design didn't hold up (react-native-screens
          demotes a backgrounded screen's activityState, making it
          genuinely non-interactive at the native level with no override —
          that's what made the map underneath un-pannable no matter how the
          sheet's own pointerEvents were configured). */}
      {/* Passport presents as a full-screen modal sliding up over whatever
          screen opened it (Flighty-style) — not another layer in the profile
          stack. The screen draws its own top bar (X / title / share); no
          native header. */}
      <Stack.Screen
        name="passport"
        options={{ presentation: 'fullScreenModal', headerShown: false }}
      />
      {/* Pre-share/export screen — modal over the passport (or straight over
          the profile via its share button). */}
      <Stack.Screen
        name="passport-share"
        options={{ presentation: 'modal', headerShown: false }}
      />
      <Stack.Screen
        name="profile/edit"
        // Native back item with the label hidden ('minimal') — suppresses the
        // ugly "(tabs)" fallback label without a custom headerLeft. A custom
        // view here fought iOS 26's automatic bar-button capsule (oval shape,
        // off-center chevron); the system item renders it correctly.
        options={{ ...HEADER, title: 'Settings', headerBackButtonDisplayMode: 'minimal' }}
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
          {/* initialWindowMetrics seeds the provider synchronously (measured
              natively before JS starts) instead of starting at insets=0 and
              correcting a frame later — without it, any screen positioned
              off insets.top on cold launch (e.g. the parks list title)
              could render under the notch/Dynamic Island for a frame, then
              visibly jump down once the real value arrives. */}
          <SafeAreaProvider initialMetrics={initialWindowMetrics}>
            <StatusBar style="auto" />
            <SplashController onReady={() => setAppReady(true)} />
            {/* Not wrapped in <ClerkLoaded> — that would block RootStack behind
                a still-unresolved Clerk bootstrap (e.g. offline), turning the
                splash timeout above into a blank screen instead of the app.
                AuthSync and every screen under RootStack already guard on
                isLoaded/getToken, so rendering before Clerk resolves is safe. */}
            <AuthSync />
            <RootStack />
            <LoadingScreen visible={!appReady} />
            <ToastHost />
            <PinchZoomHost />
            <ImageLightboxHost />
          </SafeAreaProvider>
          </PaletteProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default Sentry.wrap(RootLayout);
