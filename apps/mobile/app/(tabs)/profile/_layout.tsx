import { Stack } from 'expo-router';

const HEADER = {
  headerStyle: { backgroundColor: '#F2EBDB' },
  headerTintColor: '#1F3D2E',
  headerShadowVisible: false,
  headerBackTitle: 'Profile',
};

export default function ProfileStackLayout() {
  return (
    <Stack screenOptions={HEADER}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="badges"   options={{ title: 'Badges' }} />
      <Stack.Screen name="journal/index" options={{ title: 'Journal' }} />
      <Stack.Screen name="journal/[id]" options={{ headerBackTitle: 'Journal' }} />
      <Stack.Screen name="passport" options={{ title: 'Passport' }} />
      <Stack.Screen
        name="friends"
        options={{
          headerShown: false,
          presentation: 'modal',
          gestureEnabled: true,
          contentStyle: { backgroundColor: '#F2EBDB' },
        }}
      />
    </Stack>
  );
}
