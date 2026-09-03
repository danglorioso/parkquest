import {
  KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSignIn } from '@clerk/clerk-expo';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  clerkMsg, ErrorBox, FField, InfoText, PrimaryBtn,
} from '@/components/AuthAtoms';
import { STATIC as C, useColors } from '@/lib/palette';
import { markLastAuthStrategy } from '@/lib/lastAccount';

type Step = 'form' | 'mfa' | 'forgot_email' | 'forgot_verify';

// ── Screen ────────────────────────────────────────────────────────────────────

export default function LoginScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const T = useColors();
  const { signIn, setActive, isLoaded } = useSignIn();
  const { email: prefillEmail } = useLocalSearchParams<{ email?: string }>();

  const [step,      setStep]      = useState<Step>('form');
  const [email,     setEmail]     = useState(prefillEmail ?? '');
  const [password,  setPassword]  = useState('');
  const [showPw,    setShowPw]    = useState(false);
  const [mfaCode,   setMfaCode]   = useState('');
  const [fgEmail,   setFgEmail]   = useState('');
  const [fgCode,    setFgCode]    = useState('');
  const [fgPw,      setFgPw]      = useState('');
  const [fgShowPw,  setFgShowPw]  = useState(false);
  const [busy,      setBusy]      = useState(false);
  const [error,     setError]     = useState('');

  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  // Steps back within this screen (mfa/forgot_verify/forgot_email all lead
  // back toward 'form') rather than popping the whole screen — the header's
  // own back button is replaced below to actually do this, instead of the
  // previous approach of hiding it (headerLeft: () => null, which wasn't
  // reliably suppressing the native arrow) and placing a second, redundant
  // back button inline under the primary action button on every step.
  const stepBack = () => {
    setError('');
    if (step === 'mfa') { setStep('form'); setMfaCode(''); }
    else if (step === 'forgot_email') { setStep('form'); }
    else if (step === 'forgot_verify') { setStep('forgot_email'); setFgCode(''); }
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: step === 'form' ? undefined : () => (
        <TouchableOpacity onPress={stepBack} hitSlop={10} style={{ paddingRight: 12, paddingVertical: 4 }}>
          <Ionicons name="chevron-back" size={24} color={T.primary} />
        </TouchableOpacity>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, step]);

  const handleSignIn = async () => {
    if (!isLoaded) return;
    setError('');
    setBusy(true);
    try {
      const result = await signIn!.create({ identifier: email, password });
      if (!mounted.current) return;
      if (result.status === 'complete') {
        markLastAuthStrategy('password', email);
        await setActive!({ session: result.createdSessionId });
        router.replace('/(tabs)/feed' as never);
      } else if (result.status === 'needs_second_factor') {
        const supported = result.supportedSecondFactors ?? [];
        const emailF = supported.find((f: any) => f.strategy === 'email_code') as any;
        const phoneF = supported.find((f: any) => f.strategy === 'phone_code') as any;
        if (emailF) {
          await signIn!.prepareSecondFactor({ strategy: 'email_code', emailAddressId: emailF.emailAddressId });
        } else if (phoneF) {
          await signIn!.prepareSecondFactor({ strategy: 'phone_code', phoneNumberId: phoneF.phoneNumberId });
        }
        if (!mounted.current) return;
        setStep('mfa');
      }
    } catch (e) { if (mounted.current) setError(clerkMsg(e)); }
    finally { if (mounted.current) setBusy(false); }
  };

  const handleMfa = async () => {
    if (!isLoaded) return;
    setError('');
    setBusy(true);
    try {
      const result = await signIn!.attemptSecondFactor({ strategy: 'email_code', code: mfaCode });
      if (!mounted.current) return;
      if (result.status === 'complete') {
        markLastAuthStrategy('password', email);
        await setActive!({ session: result.createdSessionId });
        router.replace('/(tabs)/feed' as never);
      }
    } catch (e) { if (mounted.current) setError(clerkMsg(e)); }
    finally { if (mounted.current) setBusy(false); }
  };

  const handleForgotSend = async () => {
    if (!isLoaded) return;
    setError('');
    setBusy(true);
    try {
      await signIn!.create({ strategy: 'reset_password_email_code', identifier: fgEmail });
      setStep('forgot_verify');
    } catch (e) { setError(clerkMsg(e)); }
    finally { setBusy(false); }
  };

  const handleForgotReset = async () => {
    if (!isLoaded) return;
    setError('');
    setBusy(true);
    try {
      const result = await signIn!.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code: fgCode, password: fgPw,
      });
      if (result.status === 'complete') {
        markLastAuthStrategy('password', fgEmail);
        await setActive!({ session: result.createdSessionId });
        router.replace('/(tabs)/feed' as never);
      }
    } catch (e) { setError(clerkMsg(e)); }
    finally { setBusy(false); }
  };

  const headline =
    step === 'mfa'           ? 'Verify your identity.' :
    step === 'forgot_email'  ? 'Reset password.'       :
    step === 'forgot_verify' ? 'Check your email.'     :
                               'Welcome back.';

  const sub =
    step === 'mfa'           ? "Enter the code sent to your email."    :
    step === 'forgot_email'  ? "We'll send a reset code to your email." :
    step === 'forgot_verify' ? "Enter the code and your new password." :
                               'Pick up where you left off.';

  return (
    <SafeAreaView style={st.screen} edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        {/* Fields scroll independently of the footer below — on a short
            screen with the keyboard up, the old single flex:1 column (no
            ScrollView) could push the primary button entirely past the
            visible/tappable area instead of reflowing, since a plain View
            doesn't scroll when its content overflows a squeezed container.
            The button now lives in a fixed footer sibling instead of in
            this flow, so it stays pinned right above the keyboard
            regardless of how tall the fields above are. */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 36, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={st.headline}>{headline}</Text>
          <Text style={st.sub}>{sub}</Text>

          <View style={{ marginTop: 28 }}>
            {step === 'mfa' && <>
              <FField label="VERIFICATION CODE" value={mfaCode} onChange={setMfaCode} keyboard="number-pad" autoFocus textContentType="oneTimeCode" />
              {error ? <ErrorBox msg={error} /> : null}
            </>}

            {step === 'form' && <>
              <FField label="EMAIL OR USERNAME" value={email} onChange={setEmail} keyboard="email-address" autoFocus={!prefillEmail} textContentType="username" />
              <FField
                label="PASSWORD" value={password} onChange={setPassword}
                secureText={!showPw} trailing={showPw ? 'Hide' : 'Show'}
                onTrailing={() => setShowPw(v => !v)} autoFocus={!!prefillEmail}
                textContentType="password"
              />
              <TouchableOpacity
                onPress={() => { setFgEmail(email); setStep('forgot_email'); setError(''); }}
                style={{ alignSelf: 'flex-end', marginBottom: 14 }}
              >
                <Text style={[st.forgotText, { color: T.primary }]}>Forgot password?</Text>
              </TouchableOpacity>
              {error ? <ErrorBox msg={error} /> : null}
            </>}

            {step === 'forgot_email' && <>
              <FField label="EMAIL" value={fgEmail} onChange={setFgEmail} keyboard="email-address" autoFocus textContentType="username" />
              {error ? <ErrorBox msg={error} /> : null}
            </>}

            {step === 'forgot_verify' && <>
              <InfoText>
                We sent a reset code to <Text style={{ color: C.ink, fontWeight: '700' }}>{fgEmail}</Text>.
                {' '}Enter it with your new password.
              </InfoText>
              <FField label="RESET CODE" value={fgCode} onChange={setFgCode} autoFocus textContentType="oneTimeCode" />
              <FField
                label="NEW PASSWORD" value={fgPw} onChange={setFgPw}
                secureText={!fgShowPw} trailing={fgShowPw ? 'Hide' : 'Show'}
                onTrailing={() => setFgShowPw(v => !v)}
                textContentType="newPassword"
              />
              {error ? <ErrorBox msg={error} /> : null}
            </>}
          </View>
        </ScrollView>

        {/* Pinned footer — the step's primary action is always visible and
            tappable above the keyboard, independent of scroll position. */}
        <View style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16 }}>
          {step === 'mfa' && <PrimaryBtn label="Verify" onPress={handleMfa} loading={busy} />}
          {step === 'form' && <PrimaryBtn label="Sign In" onPress={handleSignIn} loading={busy} />}
          {step === 'forgot_email' && <PrimaryBtn label="Send Reset Code" onPress={handleForgotSend} loading={busy} disabled={!fgEmail} />}
          {step === 'forgot_verify' && <PrimaryBtn label="Reset Password" onPress={handleForgotReset} loading={busy} disabled={!fgCode || !fgPw} />}

          {(step === 'form') && (
            <View style={st.switchRow}>
              <Text style={st.switchText}>Don't have an account?</Text>
              <TouchableOpacity onPress={() => router.replace('/(auth)/sign-up' as never)}>
                <Text style={[st.switchLink, { color: T.primary }]}> Create one</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },

  headline: { fontSize: 32, fontWeight: '800', color: C.ink, letterSpacing: -0.8, marginTop: 8, lineHeight: 34 },
  sub:      { fontSize: 14, color: C.inkMute, marginTop: 6 },

  forgotText: { fontSize: 13, fontWeight: '600' },

  switchRow:  { flexDirection: 'row', justifyContent: 'center', marginTop: 14 },
  switchText: { fontSize: 13, color: C.inkMute },
  switchLink: { fontSize: 13, fontWeight: '700' },
});
