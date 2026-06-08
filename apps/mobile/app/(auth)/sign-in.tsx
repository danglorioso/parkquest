import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useSignIn, useOAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { Link, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

export default function SignIn() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const router = useRouter();
  const { startOAuthFlow: googleOAuth } = useOAuth({ strategy: 'oauth_google' });
  const { startOAuthFlow: appleOAuth } = useOAuth({ strategy: 'oauth_apple' });

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [needsMfa, setNeedsMfa] = useState(false);
  const [mfaStrategy, setMfaStrategy] = useState<'totp' | 'phone_code' | 'email_code'>('totp');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onOAuth = async (provider: 'google' | 'apple') => {
    try {
      const flow = provider === 'google' ? googleOAuth : appleOAuth;
      const { createdSessionId, setActive: sa } = await flow();
      if (createdSessionId && sa) {
        await sa({ session: createdSessionId });
        router.replace('/(tabs)' as never);
      }
    } catch (e: unknown) {
      const clerkErr = e as { errors?: { message: string }[] };
      setError(clerkErr?.errors?.[0]?.message ?? 'OAuth sign in failed');
    }
  };

  const onSignIn = async () => {
    if (!isLoaded) return;
    setLoading(true);
    setError('');
    try {
      const result = await signIn.create({ identifier: email, password });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
      } else if (result.status === 'needs_second_factor') {
        const supported = result.supportedSecondFactors ?? [];
        const emailFactor = supported.find((f: { strategy: string }) => f.strategy === 'email_code') as { emailAddressId: string } | undefined;
        const phoneFactor = supported.find((f: { strategy: string }) => f.strategy === 'phone_code') as { phoneNumberId: string } | undefined;
        if (emailFactor) {
          await signIn.prepareSecondFactor({ strategy: 'email_code', emailAddressId: emailFactor.emailAddressId });
          setMfaStrategy('email_code');
        } else if (phoneFactor) {
          await signIn.prepareSecondFactor({ strategy: 'phone_code', phoneNumberId: phoneFactor.phoneNumberId });
          setMfaStrategy('phone_code');
        } else {
          setMfaStrategy('totp');
        }
        setNeedsMfa(true);
      }
    } catch (e: unknown) {
      const clerkErr = e as { errors?: { message: string }[] };
      setError(clerkErr?.errors?.[0]?.message ?? 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  const onMfa = async () => {
    if (!isLoaded) return;
    setLoading(true);
    setError('');
    try {
      const result = await signIn.attemptSecondFactor({ strategy: mfaStrategy, code: mfaCode });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
      }
    } catch (e: unknown) {
      const clerkErr = e as { errors?: { message: string }[] };
      setError(clerkErr?.errors?.[0]?.message ?? 'Invalid code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1 justify-center px-6"
      >
        <View className="mb-10">
          <Text className="text-4xl font-bold text-brand-700">ParkQuest</Text>
          <Text className="text-gray-500 mt-1">Explore every trail. Share every peak.</Text>
        </View>

        {/* OAuth buttons */}
        {!needsMfa && (
          <View className="gap-3 mb-6">
            <TouchableOpacity
              className="flex-row items-center justify-center gap-3 border border-gray-200 rounded-xl py-4 bg-white"
              onPress={() => onOAuth('google')}
            >
              <Ionicons name="logo-google" size={20} color="#EA4335" />
              <Text className="font-semibold text-gray-700">Continue with Google</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-row items-center justify-center gap-3 border border-gray-200 rounded-xl py-4 bg-black"
              onPress={() => onOAuth('apple')}
            >
              <Ionicons name="logo-apple" size={20} color="white" />
              <Text className="font-semibold text-white">Continue with Apple</Text>
            </TouchableOpacity>

            <View className="flex-row items-center gap-3 my-2">
              <View className="flex-1 h-px bg-gray-200" />
              <Text className="text-gray-400 text-sm">or</Text>
              <View className="flex-1 h-px bg-gray-200" />
            </View>
          </View>
        )}

        {needsMfa ? (
          <View className="gap-3">
            <Text className="text-gray-700 font-medium">
              {mfaStrategy === 'email_code'
                ? `Enter the code sent to ${email}`
                : mfaStrategy === 'phone_code'
                ? 'Enter the code sent to your phone'
                : 'Enter your authenticator app code'}
            </Text>
            <TextInput
              className="border border-gray-200 rounded-xl px-4 py-4 text-base bg-gray-50 tracking-widest"
              placeholder="6-digit code"
              value={mfaCode}
              onChangeText={setMfaCode}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
            />
            {error ? <Text className="text-red-500 text-sm">{error}</Text> : null}
            <TouchableOpacity
              className="bg-brand-600 rounded-xl py-4 items-center mt-2"
              onPress={onMfa}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="white" />
                : <Text className="text-white font-semibold text-base">Verify</Text>}
            </TouchableOpacity>
          </View>
        ) : (
          <View className="gap-3">
            <TextInput
              className="border border-gray-200 rounded-xl px-4 py-4 text-base bg-gray-50"
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
            <TextInput
              className="border border-gray-200 rounded-xl px-4 py-4 text-base bg-gray-50"
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
            />
            {error ? <Text className="text-red-500 text-sm">{error}</Text> : null}
            <TouchableOpacity
              className="bg-brand-600 rounded-xl py-4 items-center mt-2"
              onPress={onSignIn}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="white" />
                : <Text className="text-white font-semibold text-base">Sign In</Text>}
            </TouchableOpacity>
          </View>
        )}

        <View className="flex-row justify-center mt-6">
          <Text className="text-gray-500">Don't have an account? </Text>
          <Link href="/(auth)/sign-up">
            <Text className="text-brand-600 font-semibold">Sign Up</Text>
          </Link>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
