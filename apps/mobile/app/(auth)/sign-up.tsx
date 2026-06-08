import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useSignUp } from '@clerk/clerk-expo';
import { Link, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SignUp() {
  const { signUp, setActive, isLoaded } = useSignUp();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [pendingVerification, setPendingVerification] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSignUp = async () => {
    if (!isLoaded) return;
    setLoading(true);
    setError('');
    try {
      await signUp.create({ emailAddress: email, password });
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setPendingVerification(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Sign up failed');
    } finally {
      setLoading(false);
    }
  };

  const onVerify = async () => {
    if (!isLoaded) return;
    setLoading(true);
    setError('');
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        router.replace('/(tabs)' as never);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Verification failed');
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
          <Text className="text-gray-500 mt-1">Create your account</Text>
        </View>

        {!pendingVerification ? (
          <View className="gap-3">
            <TextInput
              className="border border-gray-200 rounded-xl px-4 py-4 text-base bg-gray-50"
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              className="border border-gray-200 rounded-xl px-4 py-4 text-base bg-gray-50"
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            {error ? <Text className="text-red-500 text-sm">{error}</Text> : null}
            <TouchableOpacity
              className="bg-brand-600 rounded-xl py-4 items-center mt-2"
              onPress={onSignUp}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="white" />
                : <Text className="text-white font-semibold text-base">Create Account</Text>}
            </TouchableOpacity>
          </View>
        ) : (
          <View className="gap-3">
            <Text className="text-gray-600 text-center mb-2">
              We sent a verification code to {email}
            </Text>
            <TextInput
              className="border border-gray-200 rounded-xl px-4 py-4 text-base bg-gray-50 text-center tracking-widest"
              placeholder="000000"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              maxLength={6}
            />
            {error ? <Text className="text-red-500 text-sm text-center">{error}</Text> : null}
            <TouchableOpacity
              className="bg-brand-600 rounded-xl py-4 items-center"
              onPress={onVerify}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="white" />
                : <Text className="text-white font-semibold text-base">Verify Email</Text>}
            </TouchableOpacity>
          </View>
        )}

        <View className="flex-row justify-center mt-6">
          <Text className="text-gray-500">Already have an account? </Text>
          <Link href="/(auth)/sign-in">
            <Text className="text-brand-600 font-semibold">Sign In</Text>
          </Link>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
