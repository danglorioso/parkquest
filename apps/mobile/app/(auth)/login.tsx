import {
  ActivityIndicator, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSignIn } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';

// ── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  bg:       '#F2EBDB',
  surface:  '#FFFBF1',
  ink:      '#1B1A16',
  inkMute:  '#7A746A',
  hairline: 'rgba(27,26,22,0.10)',
  primary:  '#1F3D2E',
  accent:   '#C56B3D',
};

const MONO = 'JetBrainsMono_600SemiBold';

type Step = 'form' | 'mfa' | 'forgot_email' | 'forgot_verify';

// ── Atoms ─────────────────────────────────────────────────────────────────────

function FField({
  label, value, onChange, secureText = false,
  keyboard, trailing, onTrailing, autoFocus = false,
}: {
  label: string; value: string; onChange: (v: string) => void;
  secureText?: boolean; keyboard?: 'email-address' | 'number-pad' | 'default';
  trailing?: string; onTrailing?: () => void; autoFocus?: boolean;
}) {
  return (
    <View style={st.fField}>
      <View style={{ flex: 1 }}>
        <Text style={st.fFieldLabel}>{label}</Text>
        <TextInput
          style={st.fFieldInput}
          value={value} onChangeText={onChange}
          secureTextEntry={secureText}
          keyboardType={keyboard ?? 'default'}
          autoCapitalize="none" autoCorrect={false}
          autoFocus={autoFocus}
        />
      </View>
      {trailing ? (
        <TouchableOpacity onPress={onTrailing} style={{ paddingLeft: 8, paddingBottom: 4 }}>
          <Text style={st.trailingText}>{trailing}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function PrimaryBtn({ label, onPress, loading = false, disabled = false }: {
  label: string; onPress: () => void; loading?: boolean; disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress} disabled={loading || disabled}
      style={[st.primaryBtn, (loading || disabled) && { opacity: 0.65 }]}
      activeOpacity={0.85}
    >
      {loading
        ? <ActivityIndicator color="#FFFBF1" size="small" />
        : <Text style={st.primaryBtnText}>{label}</Text>}
    </TouchableOpacity>
  );
}

function SecondaryBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={st.secondaryBtn} activeOpacity={0.7}>
      <Text style={st.secondaryBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <View style={st.errorBox}>
      <Text style={st.errorBoxText}>{msg}</Text>
    </View>
  );
}

function InfoText({ children }: { children: React.ReactNode }) {
  return <Text style={st.infoText}>{children}</Text>;
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function LoginScreen() {
  const router = useRouter();
  const { signIn, setActive, isLoaded } = useSignIn();

  const [step,      setStep]      = useState<Step>('form');
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [showPw,    setShowPw]    = useState(false);
  const [mfaCode,   setMfaCode]   = useState('');
  const [fgEmail,   setFgEmail]   = useState('');
  const [fgCode,    setFgCode]    = useState('');
  const [fgPw,      setFgPw]      = useState('');
  const [fgShowPw,  setFgShowPw]  = useState(false);
  const [busy,      setBusy]      = useState(false);
  const [error,     setError]     = useState('');

  const clerkMsg = (e: unknown) => {
    const ce = e as { errors?: { message?: string; longMessage?: string }[] };
    return ce?.errors?.[0]?.longMessage ?? ce?.errors?.[0]?.message ?? 'Something went wrong.';
  };

  const handleSignIn = async () => {
    if (!isLoaded) return;
    setError('');
    setBusy(true);
    try {
      const result = await signIn!.create({ identifier: email, password });
      if (result.status === 'complete') {
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
        setStep('mfa');
      }
    } catch (e) { setError(clerkMsg(e)); }
    finally { setBusy(false); }
  };

  const handleMfa = async () => {
    if (!isLoaded) return;
    setError('');
    setBusy(true);
    try {
      const result = await signIn!.attemptSecondFactor({ strategy: 'email_code', code: mfaCode });
      if (result.status === 'complete') {
        await setActive!({ session: result.createdSessionId });
        router.replace('/(tabs)/feed' as never);
      }
    } catch (e) { setError(clerkMsg(e)); }
    finally { setBusy(false); }
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
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 36, paddingBottom: 44 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>

          <Text style={st.kicker}>SIGN IN</Text>
          <Text style={st.headline}>{headline}</Text>
          <Text style={st.sub}>{sub}</Text>

          <View style={{ marginTop: 28 }}>
            {step === 'mfa' && <>
              <FField label="VERIFICATION CODE" value={mfaCode} onChange={setMfaCode} keyboard="number-pad" autoFocus />
              {error ? <ErrorBox msg={error} /> : null}
              <PrimaryBtn label="Verify" onPress={handleMfa} loading={busy} />
              <SecondaryBtn label="Back" onPress={() => { setStep('form'); setMfaCode(''); setError(''); }} />
            </>}

            {step === 'form' && <>
              <FField label="EMAIL OR USERNAME" value={email} onChange={setEmail} keyboard="email-address" />
              <FField
                label="PASSWORD" value={password} onChange={setPassword}
                secureText={!showPw} trailing={showPw ? 'Hide' : 'Show'}
                onTrailing={() => setShowPw(v => !v)}
              />
              <TouchableOpacity
                onPress={() => { setFgEmail(email); setStep('forgot_email'); setError(''); }}
                style={{ alignSelf: 'flex-end', marginBottom: 14 }}
              >
                <Text style={st.forgotText}>Forgot password?</Text>
              </TouchableOpacity>
              {error ? <ErrorBox msg={error} /> : null}
              <PrimaryBtn label="Sign In" onPress={handleSignIn} loading={busy} />
            </>}

            {step === 'forgot_email' && <>
              <FField label="EMAIL" value={fgEmail} onChange={setFgEmail} keyboard="email-address" autoFocus />
              {error ? <ErrorBox msg={error} /> : null}
              <PrimaryBtn label="Send Reset Code" onPress={handleForgotSend} loading={busy} disabled={!fgEmail} />
              <SecondaryBtn label="Back to Sign In" onPress={() => { setStep('form'); setError(''); }} />
            </>}

            {step === 'forgot_verify' && <>
              <InfoText>
                We sent a reset code to <Text style={{ color: C.ink, fontWeight: '700' }}>{fgEmail}</Text>.
                {' '}Enter it with your new password.
              </InfoText>
              <FField label="RESET CODE" value={fgCode} onChange={setFgCode} autoFocus />
              <FField
                label="NEW PASSWORD" value={fgPw} onChange={setFgPw}
                secureText={!fgShowPw} trailing={fgShowPw ? 'Hide' : 'Show'}
                onTrailing={() => setFgShowPw(v => !v)}
              />
              {error ? <ErrorBox msg={error} /> : null}
              <PrimaryBtn label="Reset Password" onPress={handleForgotReset} loading={busy} disabled={!fgCode || !fgPw} />
              <SecondaryBtn label="Back" onPress={() => { setStep('forgot_email'); setFgCode(''); setError(''); }} />
            </>}
          </View>

          {(step === 'form') && (
            <View style={st.switchRow}>
              <Text style={st.switchText}>Don't have an account?</Text>
              <TouchableOpacity onPress={() => router.replace('/(auth)/sign-up' as never)}>
                <Text style={st.switchLink}> Create one</Text>
              </TouchableOpacity>
            </View>
          )}

        </KeyboardAvoidingView>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },

  kicker:   { fontFamily: MONO, fontSize: 13, letterSpacing: 2, color: C.inkMute, fontWeight: '600' },
  headline: { fontSize: 32, fontWeight: '800', color: C.ink, letterSpacing: -0.8, marginTop: 8, lineHeight: 34 },
  sub:      { fontSize: 14, color: C.inkMute, marginTop: 6 },

  fField: {
    backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.hairline,
    borderRadius: 12, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10,
    marginBottom: 10, flexDirection: 'row', alignItems: 'flex-end', gap: 10,
  },
  fFieldLabel:  { fontFamily: MONO, fontSize: 13, letterSpacing: 1.4, color: C.inkMute, fontWeight: '600' },
  fFieldInput:  { fontSize: 15, color: C.ink, paddingTop: 4 },
  trailingText: { fontSize: 13, fontWeight: '600', color: C.primary },

  primaryBtn:     { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginBottom: 10, minHeight: 50 },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFBF1' },
  secondaryBtn:   { paddingVertical: 12, alignItems: 'center' },
  secondaryBtnText: { fontSize: 13, fontWeight: '600', color: C.inkMute },

  errorBox:     { backgroundColor: 'rgba(192,64,64,0.08)', borderRadius: 10, borderWidth: 0.5, borderColor: 'rgba(192,64,64,0.25)', padding: 12, marginBottom: 12 },
  errorBoxText: { fontSize: 13, color: '#C04040' },
  infoText:     { fontSize: 13.5, color: C.inkMute, lineHeight: 20, marginBottom: 14 },
  forgotText:   { fontSize: 13, fontWeight: '600', color: C.primary },

  switchRow:  { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  switchText: { fontSize: 13, color: C.inkMute },
  switchLink: { fontSize: 13, fontWeight: '700', color: C.primary },
});
