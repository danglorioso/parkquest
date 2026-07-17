import { Stack } from 'expo-router';
import { HolographicShine } from '@/components/HolographicShine';
import { STATIC, colorStr, useColors } from '@/lib/palette';

// Passport gold foil — fixed regardless of app palette, matches the
// passport screen's own intentionally-fixed cover colors.
const GOLD = '#C9A94A';

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
      <Stack.Screen
        name="passport"
        options={{
          title: 'Passport',
          headerStyle: { backgroundColor: T.primaryDeep },
          headerTitleStyle: { color: GOLD, fontWeight: '700' },
          headerTintColor: GOLD,
          headerBackground: () => <HolographicShine />,
        }}
      />
      <Stack.Screen name="friends" options={{ title: 'Friends' }} />
    </Stack>
  );
}
