import { Text, TouchableOpacity } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { STATIC, colorStr, useColors } from '@/lib/palette';

export default function ProfileStackLayout() {
  const T = useColors();
  const router = useRouter();
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
      <Stack.Screen
        name="friends"
        options={{
          title: 'Friends',
          // Unconditional back button, not just the native auto-back: the
          // onboarding walkthrough's "Find friends" deep-links straight here,
          // and when that push doesn't leave a real screen underneath in the
          // stack, the default header shows no back arrow at all — leaving
          // the profile tab stuck on Friends with no way off it short of
          // double-tapping the tab bar icon to pop-to-top.
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => {
                if (router.canGoBack()) router.back();
                else router.replace('/(tabs)/profile');
              }}
              hitSlop={8}
              style={{ flexDirection: 'row', alignItems: 'center', marginLeft: -6 }}
            >
              <Ionicons name="chevron-back" size={26} color={T.primary} />
              <Text style={{ fontSize: 17, color: T.primary, marginLeft: -3 }}>Profile</Text>
            </TouchableOpacity>
          ),
        }}
      />
    </Stack>
  );
}
