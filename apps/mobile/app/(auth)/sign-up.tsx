import {
  KeyboardAvoidingView, LayoutAnimation, Platform,
  StyleSheet, Text, TouchableOpacity, UIManager, View,
} from 'react-native';
import { useLayoutEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSignUp, useUser } from '@clerk/clerk-expo';
import { useNavigation, useRouter } from 'expo-router';
import {
  clerkMsg, ErrorBox, FField, MONO, NameField, PrimaryBtn, SecondaryBtn, TermsCheckbox,
} from '@/components/AuthAtoms';
import { STATIC as C, useColors } from '@/lib/palette';
import { markLastAuthStrategy } from '@/lib/lastAccount';

type Step = 'email' | 'password' | 'verify' | 'username';

// LayoutAnimation needs an explicit opt-in on Android's old architecture
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const animateReveal = () =>
  LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'));

// ── Screen ────────────────────────────────────────────────────────────────────

export default function SignUpScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const T = useColors();
  const { signUp, setActive, isLoaded } = useSignUp();
  const { user } = useUser();

  const [step,     setStep]     = useState<Step>('email');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [code,     setCode]     = useState('');
  const [username, setUsername] = useState('');
  const [showName, setShowName] = useState(true);
  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const toggleShowName = () => {
    animateReveal();
    setShowName(v => !v);
  };

  useLayoutEffect(() => {
    navigation.setOptions({ headerLeft: step === 'email' ? undefined : () => null });
  }, [navigation, step]);

  const handleEmailContinue = () => {
    if (!email.trim()) return;
    setError('');
    setStep('password');
  };

  const handleCreateAccount = async () => {
    if (!isLoaded) return;
    setError('');
    setBusy(true);
    try {
      await signUp!.create({ emailAddress: email, password });
      await signUp!.prepareEmailAddressVerification({ strategy: 'email_code' });
      setStep('verify');
    } catch (e) {
      const ce = e as { errors?: { code?: string; message?: string; longMessage?: string }[] };
      const first = ce?.errors?.[0];
      if (first?.code === 'form_identifier_exists') {
        setError('Account already exists. Please sign in instead.');
      } else {
        setError(first?.longMessage ?? first?.message ?? 'Something went wrong.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async () => {
    if (!isLoaded) return;
    setError('');
    setBusy(true);
    try {
      const result = await signUp!.attemptEmailAddressVerification({ code });
      if (result.status === 'complete') {
        markLastAuthStrategy('password', email);
        await setActive!({ session: result.createdSessionId });
        setStep('username');
      } else if (result.status === 'missing_requirements') {
        // Email verified, but the instance requires more fields (username).
        // No session exists yet — the username step completes the sign-up.
        setStep('username');
      } else {
        setError('Verification incomplete. Please try again.');
      }
    } catch (e) {
      const ce = e as { errors?: { code?: string }[] };
      if (ce?.errors?.[0]?.code === 'verification_already_verified') {
        // A previous tap already verified the email — move on instead of erroring.
        try {
          if (signUp?.status === 'complete' && signUp.createdSessionId) {
            markLastAuthStrategy('password', email);
            await setActive!({ session: signUp.createdSessionId });
          }
        } catch { /* session activation retried implicitly on next step */ }
        setStep('username');
      } else {
        setError(clerkMsg(e));
      }
    } finally { setBusy(false); }
  };

  const handleUsername = async () => {
    const uname = username.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (uname.length < 3) return;
    setError('');
    setBusy(true);
    const nameFields = showName
      ? { firstName: firstName.trim() || undefined, lastName: lastName.trim() || undefined }
      : {};
    try {
      if (signUp && signUp.status === 'missing_requirements') {
        // Sign-up not finished yet (no session) — username completes it.
        const result = await signUp.update({ username: uname, ...nameFields });
        if (result.status !== 'complete') {
          setError('Could not finish sign-up. Please try again.');
          return;
        }
        markLastAuthStrategy('password', email);
        await setActive!({ session: result.createdSessionId });
      } else if (user) {
        await user.update({ username: uname, ...nameFields });
      } else {
        setError('Account not ready yet. Please try again.');
        return;
      }
      router.replace('/(tabs)/feed' as never);
    } catch (e) { setError(clerkMsg(e)); }
    finally { setBusy(false); }
  };

  const headline =
    step === 'email'    ? 'Start your quest.'  :
    step === 'password' ? 'Create a password.' :
    step === 'verify'   ? 'Check your email.'  :
                          'One last thing.';

  const sub =
    step === 'email'    ? 'Free, ad-free, your data stays yours.'  :
    step === 'password' ? `Creating account for ${email}`           :
    step === 'verify'   ? `We sent a code to ${email}`             :
                          'Choose a username for your profile.';

  return (
    <SafeAreaView style={st.screen} edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 36, paddingBottom: 44 }}>

          <Text style={st.kicker}>CREATE ACCOUNT</Text>
          <Text style={st.headline}>{headline}</Text>
          <Text style={st.sub}>{sub}</Text>

          <View style={{ marginTop: 28 }}>
            {step === 'email' && <>
              <FField label="EMAIL" value={email} onChange={setEmail} keyboard="email-address" autoFocus />
              {error ? <ErrorBox msg={error} /> : null}
              <PrimaryBtn label="Continue" onPress={handleEmailContinue} disabled={!email.trim()} />
            </>}

            {step === 'password' && <>
              <FField
                label="PASSWORD" value={password} onChange={setPassword}
                secureText={!showPw} trailing={showPw ? 'Hide' : 'Show'}
                onTrailing={() => setShowPw(v => !v)} autoFocus
              />
              {error ? <ErrorBox msg={error} /> : null}
              <PrimaryBtn label="Create Account" onPress={handleCreateAccount} loading={busy} disabled={!password} />
              <SecondaryBtn icon="chevron-back" onPress={() => { setStep('email'); setError(''); setPassword(''); }} />
            </>}

            {step === 'verify' && <>
              <FField label="VERIFICATION CODE" value={code} onChange={setCode} keyboard="number-pad" autoFocus />
              {error ? <ErrorBox msg={error} /> : null}
              <PrimaryBtn label="Verify Email" onPress={handleVerify} loading={busy} disabled={!code} />
              <SecondaryBtn icon="chevron-back" onPress={() => { setStep('password'); setError(''); setCode(''); }} />
            </>}

            {step === 'username' && <>
              <FField
                label="USERNAME" value={username}
                onChange={v => setUsername(v.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                autoFocus
              />
              <Text style={st.helperText}>Lowercase letters, numbers, underscores · min 3 chars</Text>

              <NameField
                open={showName} onToggle={toggleShowName}
                firstName={firstName} lastName={lastName}
                onFirstName={setFirstName} onLastName={setLastName}
              />

              <TermsCheckbox checked={agreedToTerms} onToggle={() => setAgreedToTerms(v => !v)} />

              {error ? <ErrorBox msg={error} /> : null}
              <PrimaryBtn
                label="Enter ParkQuest"
                onPress={handleUsername}
                loading={busy}
                disabled={username.length < 3 || !agreedToTerms}
              />
            </>}
          </View>

          {step === 'email' && (
            <View style={st.switchRow}>
              <Text style={st.switchText}>Already have an account?</Text>
              <TouchableOpacity onPress={() => router.replace('/(auth)/login' as never)}>
                <Text style={[st.switchLink, { color: T.primary }]}> Sign in</Text>
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

  kicker:   { fontFamily: MONO, fontSize: 13, letterSpacing: 2, color: C.inkMute, fontWeight: '600' },
  headline: { fontSize: 32, fontWeight: '800', color: C.ink, letterSpacing: -0.8, marginTop: 8, lineHeight: 34 },
  sub:      { fontSize: 14, color: C.inkMute, marginTop: 6 },

  helperText: { fontSize: 13, color: C.inkMute, marginBottom: 14 },


  // 'auto' (not a fixed value) so it's pinned to the screen's bottom edge —
  // the flexible gap that lets this no-longer-scrollable screen adapt to
  // whatever vertical space the device actually has.
  switchRow:  { flexDirection: 'row', justifyContent: 'center', marginTop: 'auto', paddingTop: 24 },
  switchText: { fontSize: 13, color: C.inkMute },
  switchLink: { fontSize: 13, fontWeight: '700' },
});
