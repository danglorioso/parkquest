import { Stack } from 'expo-router';
import { STATIC, useColors } from '@/lib/palette';

export default function AuthLayout() {
  const T = useColors();
  const HEADER = {
    headerStyle: { backgroundColor: STATIC.bg },
    headerTintColor: T.primary,
    headerShadowVisible: false,
    headerBackTitle: 'Back',
  };
  return (
    <Stack>
      <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      <Stack.Screen name="login"   options={{ ...HEADER, title: 'Sign In' }} />
      <Stack.Screen name="sign-up" options={{ ...HEADER, title: 'Create Account' }} />
    </Stack>
  );
}
