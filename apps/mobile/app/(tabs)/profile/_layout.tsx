import { Stack } from 'expo-router';
import { STATIC, useColors } from '@/lib/palette';

export default function ProfileStackLayout() {
  const T = useColors();
  const HEADER = {
    headerStyle: { backgroundColor: STATIC.bg },
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
      <Stack.Screen name="passport" options={{ title: 'Passport' }} />
      <Stack.Screen name="friends" options={{ title: 'Friends' }} />
    </Stack>
  );
}
