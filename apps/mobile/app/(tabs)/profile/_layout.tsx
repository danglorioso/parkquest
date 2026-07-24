import { Stack } from 'expo-router';
import { STATIC, colorStr, useColors } from '@/lib/palette';

export default function ProfileStackLayout() {
  const T = useColors();
  const HEADER = {
    headerStyle: { backgroundColor: colorStr(STATIC.bg) },
    headerTitleStyle: { color: colorStr(STATIC.ink) },
    headerTintColor: T.primary,
    headerShadowVisible: false,
    headerBackTitle: 'Profile',
  };
  return (
    <Stack screenOptions={HEADER}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="badges"   options={{ title: 'Badges' }} />
      <Stack.Screen name="journal/index" options={{ title: 'Journal' }} />
      <Stack.Screen name="journal/[id]" options={{ headerBackTitle: 'Journal' }} />
      {/* No native header at all — the screen's own green cover extends up
          under the status bar and provides its own back button. A native
          header (even with a custom headerBackground) paints its default
          white for a frame before the React background mounts. */}
      <Stack.Screen name="passport" options={{ headerShown: false }} />
      {/* Plain default back — arrow only, no "Profile" label (headerBackTitle
          is set globally above). The cross-tab entry points that link here
          (feed's friend filter, onboarding) now seed the profile tab's stack
          with its root before navigating to this screen, so there's always a
          real "profile" underneath to pop back to; no forced-redirect hack
          needed here anymore. */}
      <Stack.Screen
        name="friends"
        options={{ title: 'Friends', headerBackTitle: '' }}
      />
    </Stack>
  );
}
