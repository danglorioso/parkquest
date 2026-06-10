import { Stack } from 'expo-router';

const HEADER = {
  headerStyle: { backgroundColor: '#F2EBDB' },
  headerTintColor: '#1F3D2E',
  headerShadowVisible: false,
  headerBackTitle: 'Back',
};

export default function AuthLayout() {
  return (
    <Stack>
      <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      <Stack.Screen name="login"   options={{ ...HEADER, title: 'Sign In' }} />
      <Stack.Screen name="sign-up" options={{ ...HEADER, title: 'Create Account' }} />
    </Stack>
  );
}
