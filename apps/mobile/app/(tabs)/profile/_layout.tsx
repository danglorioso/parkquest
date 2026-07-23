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
          // Always target profile directly rather than router.back(): the feed
          // page's friend filter and the onboarding walkthrough both deep-link
          // straight here, and router.back() in that case pops to whatever
          // sent us here (feed) instead of profile — tapping "Manage friends"
          // again from feed re-pushes Friends, so back/push loops between
          // Feed and Friends and profile is never reachable from here.
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.replace('/(tabs)/profile')}
              hitSlop={8}
              style={{ flexDirection: 'row', alignItems: 'center', marginLeft: -6 }}
            >
              <Ionicons name="chevron-back" size={26} color={T.primary} />
              <Text style={{ fontSize: 17, color: T.primary, marginLeft: -3 }}>Profile</Text>
            </TouchableOpacity>
          ),
        }}
        // The native edge-swipe and Android hardware back both call
        // navigation.goBack() directly, bypassing headerLeft — intercept the
        // pop itself so every exit path (button/swipe/hardware back) lands
        // on profile instead of wherever the stack would otherwise pop to.
        // Only redirect GO_BACK/POP — router.replace() above also removes
        // this screen and re-fires beforeRemove, and preventDefault()-ing
        // THAT too made the replace call itself forever, which is what blew
        // the "Maximum update depth exceeded" error.
        listeners={() => ({
          beforeRemove: e => {
            if (e.data.action.type === 'REPLACE') return;
            e.preventDefault();
            router.replace('/(tabs)/profile');
          },
        })}
      />
    </Stack>
  );
}
