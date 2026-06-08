import {
  ActivityIndicator, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSignIn, useSignUp, useOAuth, useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

// ── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  bg:          '#F2EBDB',
  surface:     '#FFFBF1',
  surfaceAlt:  '#F7F0DE',
  ink:         '#1B1A16',
  inkMute:     '#7A746A',
  hairline:    'rgba(27,26,22,0.10)',
  primary:     '#1F3D2E',
  primaryDeep: '#152A20',
  accent:      '#C56B3D',
};

const MONO = Platform.OS === 'ios' ? 'Courier New' : 'monospace';

// 15 stars: [left, top, opacity]
const STARS: [number, number, number][] = [
  [48,  38, 0.80], [132, 28, 0.70], [210, 55, 0.60], [288, 38, 0.85],
  [340, 65, 0.65], [72,  95, 0.55], [175, 80, 0.70], [255, 95, 0.60],
  [320, 32, 0.75], [28,  70, 0.65], [155, 48, 0.60], [310, 95, 0.55],
  [90,  50, 0.75], [230, 30, 0.65], [360, 85, 0.70],
];

type Mode       = 'signin' | 'signup' | 'username' | 'forgot';
type SignUpStep = 'email' | 'password' | 'verify';
type ForgotStep = 'email' | 'verify';

// ── Hero ──────────────────────────────────────────────────────────────────────

function HeroSection() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.hero, { height: 238 + insets.top }]}>
      {/* Stars */}
      {STARS.map(([x, y, o], i) => {
        const sz = 2 + (i % 3);
        return (
          <View
            key={i}
            style={{
              position: 'absolute', top: y + insets.top * 0.5,
              left: x, width: sz, height: sz,
              borderRadius: sz, backgroundColor: '#FFFBF1', opacity: o,
            }}
          />
        );
      })}

      {/* Back mountain layer */}
      <View style={{ position: 'absolute', bottom: 42, left: -15, width: 160, height: 115, borderTopLeftRadius: 28, borderTopRightRadius: 80, backgroundColor: 'rgba(0,0,0,0.16)' }} />
      <View style={{ position: 'absolute', bottom: 42, left: 92, width: 195, height: 145, borderTopLeftRadius: 100, borderTopRightRadius: 52, backgroundColor: 'rgba(0,0,0,0.16)' }} />
      <View style={{ position: 'absolute', bottom: 42, left: 244, width: 185, height: 115, borderTopLeftRadius: 62, borderTopRightRadius: 42, backgroundColor: 'rgba(0,0,0,0.16)' }} />

      {/* Mid mountain layer */}
      <View style={{ position: 'absolute', bottom: 16, left: -26, width: 215, height: 92, borderTopLeftRadius: 54, borderTopRightRadius: 116, backgroundColor: 'rgba(0,0,0,0.30)' }} />
      <View style={{ position: 'absolute', bottom: 16, left: 144, width: 268, height: 108, borderTopLeftRadius: 90, borderTopRightRadius: 64, backgroundColor: 'rgba(0,0,0,0.30)' }} />

      {/* Front ridge */}
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 44, backgroundColor: 'rgba(0,0,0,0.46)' }} />

      {/* Wordmark */}
      <View style={[styles.wordmark, { top: insets.top + 18 }]}>
        <Ionicons name="compass" size={18} color="#FFFBF1" style={{ marginTop: -1 }} />
        <Text style={styles.wordmarkText}>
          Park<Text style={{ fontWeight: '400' }}>Quest</Text>
        </Text>
      </View>

      {/* Tagline anchored above front ridge */}
      <View style={styles.heroBottom}>
        <Text style={styles.heroKicker}>63 PARKS · ONE QUEST</Text>
        <Text style={styles.heroHeadline}>Every park.{'\n'}One journal.</Text>
      </View>
    </View>
  );
}

// ── Floating-label field ──────────────────────────────────────────────────────

function FField({
  label, value, onChange, secureText = false, keyboard,
  trailing, onTrailing, autoFocus = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  secureText?: boolean;
  keyboard?: 'email-address' | 'number-pad' | 'default';
  trailing?: string;
  onTrailing?: () => void;
  autoFocus?: boolean;
}) {
  return (
    <View style={styles.fField}>
      <View style={{ flex: 1 }}>
        <Text style={styles.fFieldLabel}>{label}</Text>
        <TextInput
          style={styles.fFieldInput}
          value={value}
          onChangeText={onChange}
          secureTextEntry={secureText}
          keyboardType={keyboard ?? 'default'}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus={autoFocus}
        />
      </View>
      {trailing ? (
        <TouchableOpacity onPress={onTrailing} style={{ paddingLeft: 8, paddingBottom: 4 }}>
          <Text style={styles.fFieldTrailingText}>{trailing}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// ── Shared UI atoms ───────────────────────────────────────────────────────────

function ErrorBox({ msg }: { msg: string }) {
  return (
    <View style={styles.errorBox}>
      <Text style={styles.errorBoxText}>{msg}</Text>
    </View>
  );
}

function PrimaryBtn({ label, onPress, loading = false, disabled = false }: {
  label: string; onPress: () => void; loading?: boolean; disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={loading || disabled}
      style={[styles.primaryBtn, (loading || disabled) && { opacity: 0.65 }]}
      activeOpacity={0.85}
    >
      {loading
        ? <ActivityIndicator color="#FFFBF1" size="small" />
        : <Text style={styles.primaryBtnText}>{label}</Text>}
    </TouchableOpacity>
  );
}

function SecondaryBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.secondaryBtn} activeOpacity={0.7}>
      <Text style={styles.secondaryBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AuthScreen() {
  const { signIn, setActive: setSIActive, isLoaded: siLoaded } = useSignIn();
  const { signUp, setActive: setSUActive, isLoaded: suLoaded } = useSignUp();
  const { user } = useUser();
  const { startOAuthFlow: googleFlow } = useOAuth({ strategy: 'oauth_google' });
  const { startOAuthFlow: appleFlow  } = useOAuth({ strategy: 'oauth_apple' });
  const router = useRouter();

  const [mode, setMode] = useState<Mode>('signin');

  // Sign-in
  const [siEmail,    setSiEmail]    = useState('');
  const [siPassword, setSiPassword] = useState('');
  const [siShowPw,   setSiShowPw]   = useState(false);
  const [siMfaCode,  setSiMfaCode]  = useState('');
  const [siMfaStep,  setSiMfaStep]  = useState(false);

  // Sign-up
  const [suStep,     setSuStep]     = useState<SignUpStep>('email');
  const [suEmail,    setSuEmail]    = useState('');
  const [suPassword, setSuPassword] = useState('');
  const [suShowPw,   setSuShowPw]   = useState(false);
  const [suCode,     setSuCode]     = useState('');

  // Username
  const [username, setUsername] = useState('');

  // Forgot password
  const [fgEmail,    setFgEmail]    = useState('');
  const [fgCode,     setFgCode]     = useState('');
  const [fgPassword, setFgPassword] = useState('');
  const [fgShowPw,   setFgShowPw]   = useState(false);
  const [fgStep,     setFgStep]     = useState<ForgotStep>('email');

  // Shared
  const [busy,      setBusy]      = useState(false);
  const [oauthBusy, setOauthBusy] = useState<'google' | 'apple' | null>(null);
  const [error,     setError]     = useState('');

  const clearError = () => setError('');

  const clerkMsg = (e: unknown) => {
    const ce = e as { errors?: { message?: string; longMessage?: string }[] };
    return ce?.errors?.[0]?.longMessage ?? ce?.errors?.[0]?.message ?? 'Something went wrong.';
  };

  // ── OAuth ──────────────────────────────────────────────────────────────────

  const handleOAuth = async (provider: 'google' | 'apple') => {
    clearError();
    setOauthBusy(provider);
    try {
      const flow = provider === 'google' ? googleFlow : appleFlow;
      const { createdSessionId, setActive: sa, signUp: oauthSU } = await flow();
      if (createdSessionId && sa) {
        await sa({ session: createdSessionId });
        router.replace('/(tabs)/feed' as never);
      } else if ((oauthSU as any)?.status === 'missing_requirements') {
        setMode('username');
      }
    } catch (e) {
      setError(clerkMsg(e));
    } finally {
      setOauthBusy(null);
    }
  };

  // ── Sign-in ────────────────────────────────────────────────────────────────

  const handleSignIn = async () => {
    if (!siLoaded) return;
    clearError();
    setBusy(true);
    try {
      const result = await signIn!.create({ identifier: siEmail, password: siPassword });
      if (result.status === 'complete') {
        await setSIActive!({ session: result.createdSessionId });
        router.replace('/(tabs)/feed' as never);
      } else if (result.status === 'needs_second_factor') {
        const supported = result.supportedSecondFactors ?? [];
        const emailFactor = supported.find((f: any) => f.strategy === 'email_code') as any;
        const phoneFactor = supported.find((f: any) => f.strategy === 'phone_code') as any;
        if (emailFactor) {
          await signIn!.prepareSecondFactor({ strategy: 'email_code', emailAddressId: emailFactor.emailAddressId });
        } else if (phoneFactor) {
          await signIn!.prepareSecondFactor({ strategy: 'phone_code', phoneNumberId: phoneFactor.phoneNumberId });
        }
        setSiMfaStep(true);
      }
    } catch (e) {
      setError(clerkMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const handleMfa = async () => {
    if (!siLoaded) return;
    clearError();
    setBusy(true);
    try {
      const result = await signIn!.attemptSecondFactor({ strategy: 'email_code', code: siMfaCode });
      if (result.status === 'complete') {
        await setSIActive!({ session: result.createdSessionId });
        router.replace('/(tabs)/feed' as never);
      }
    } catch (e) {
      setError(clerkMsg(e));
    } finally {
      setBusy(false);
    }
  };

  // ── Sign-up ────────────────────────────────────────────────────────────────

  const handleEmailContinue = () => {
    if (!suEmail.trim()) return;
    clearError();
    setSuStep('password');
  };

  const handleCreateAccount = async () => {
    if (!suLoaded) return;
    clearError();
    setBusy(true);
    try {
      await signUp!.create({ emailAddress: suEmail, password: suPassword });
      await signUp!.prepareEmailAddressVerification({ strategy: 'email_code' });
      setSuStep('verify');
    } catch (e) {
      const ce = e as { errors?: { code?: string; message?: string; longMessage?: string }[] };
      const first = ce?.errors?.[0];
      if (first?.code === 'form_identifier_exists') {
        setSiEmail(suEmail);
        setMode('signin');
        setError('Account already exists. Please sign in.');
      } else {
        setError(first?.longMessage ?? first?.message ?? 'Something went wrong.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async () => {
    if (!suLoaded) return;
    clearError();
    setBusy(true);
    try {
      const result = await signUp!.attemptEmailAddressVerification({ code: suCode });
      if (result.status === 'complete') {
        await setSUActive!({ session: result.createdSessionId });
        setMode('username');
      }
    } catch (e) {
      setError(clerkMsg(e));
    } finally {
      setBusy(false);
    }
  };

  // ── Username ───────────────────────────────────────────────────────────────

  const handleUsername = async () => {
    if (!user || username.length < 3) return;
    clearError();
    setBusy(true);
    try {
      await user.update({ username: username.toLowerCase().replace(/[^a-z0-9_]/g, '') });
      router.replace('/(tabs)/feed' as never);
    } catch (e) {
      setError(clerkMsg(e));
    } finally {
      setBusy(false);
    }
  };

  // ── Forgot password ────────────────────────────────────────────────────────

  const handleForgotSend = async () => {
    if (!siLoaded) return;
    clearError();
    setBusy(true);
    try {
      await signIn!.create({ strategy: 'reset_password_email_code', identifier: fgEmail });
      setFgStep('verify');
    } catch (e) {
      setError(clerkMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const handleForgotReset = async () => {
    if (!siLoaded) return;
    clearError();
    setBusy(true);
    try {
      const result = await signIn!.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code: fgCode,
        password: fgPassword,
      });
      if (result.status === 'complete') {
        await setSIActive!({ session: result.createdSessionId });
        router.replace('/(tabs)/feed' as never);
      }
    } catch (e) {
      setError(clerkMsg(e));
    } finally {
      setBusy(false);
    }
  };

  // ── Tab switch ─────────────────────────────────────────────────────────────

  const switchMode = (m: 'signin' | 'signup') => {
    setMode(m);
    clearError();
    if (m === 'signup') { setSuStep('email'); }
    if (m === 'signin') { setSiMfaStep(false); }
  };

  // ── Headline / sub ─────────────────────────────────────────────────────────

  const headline =
    mode === 'signin'   ? 'Welcome back.'     :
    mode === 'signup'   ? 'Start your quest.' :
    mode === 'username' ? 'One last thing.'   :
                          'Reset password.';

  const sub =
    mode === 'signin'   ? 'Pick up where you left off.'           :
    mode === 'signup'   ? 'Free, ad-free, your data stays yours.' :
    mode === 'username' ? 'Choose a username for your profile.'   :
                          "We'll send a reset code to your email.";

  // ── OAuth row ──────────────────────────────────────────────────────────────

  const oauthRow = (
    <>
      <View style={styles.oauthRow}>
        {(['apple', 'google'] as const).map(p => (
          <TouchableOpacity
            key={p}
            style={[styles.oauthBtn, oauthBusy !== null && { opacity: 0.6 }]}
            onPress={() => handleOAuth(p)}
            disabled={oauthBusy !== null}
            activeOpacity={0.8}
          >
            {oauthBusy === p
              ? <ActivityIndicator size="small" color={C.ink} />
              : <Ionicons name={p === 'apple' ? 'logo-apple' : 'logo-google'} size={16} color={C.ink} />
            }
            <Text style={styles.oauthBtnText}>{p === 'apple' ? 'Apple' : 'Google'}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>OR</Text>
        <View style={styles.dividerLine} />
      </View>
    </>
  );

  // ── Form content ───────────────────────────────────────────────────────────

  const renderForm = () => {
    if (mode === 'signin' && siMfaStep) {
      return <>
        <Text style={styles.infoText}>Enter the verification code sent to your email.</Text>
        <FField label="VERIFICATION CODE" value={siMfaCode} onChange={setSiMfaCode} keyboard="number-pad" autoFocus />
        {error ? <ErrorBox msg={error} /> : null}
        <PrimaryBtn label="Verify" onPress={handleMfa} loading={busy} />
        <SecondaryBtn label="Back" onPress={() => { setSiMfaStep(false); setSiMfaCode(''); clearError(); }} />
      </>;
    }

    if (mode === 'signin') {
      return <>
        {oauthRow}
        <FField label="EMAIL OR USERNAME" value={siEmail} onChange={setSiEmail} keyboard="email-address" />
        <FField
          label="PASSWORD" value={siPassword} onChange={setSiPassword}
          secureText={!siShowPw} trailing={siShowPw ? 'Hide' : 'Show'}
          onTrailing={() => setSiShowPw(v => !v)}
        />
        <TouchableOpacity
          onPress={() => { setFgEmail(siEmail); setFgStep('email'); setMode('forgot'); clearError(); }}
          style={{ alignSelf: 'flex-end', marginBottom: 14 }}
        >
          <Text style={styles.forgotText}>Forgot password?</Text>
        </TouchableOpacity>
        {error ? <ErrorBox msg={error} /> : null}
        <PrimaryBtn label="Sign In" onPress={handleSignIn} loading={busy} />
      </>;
    }

    if (mode === 'signup' && suStep === 'email') {
      return <>
        {oauthRow}
        <FField label="EMAIL" value={suEmail} onChange={setSuEmail} keyboard="email-address" />
        {error ? <ErrorBox msg={error} /> : null}
        <PrimaryBtn label="Continue" onPress={handleEmailContinue} disabled={!suEmail.trim()} />
      </>;
    }

    if (mode === 'signup' && suStep === 'password') {
      return <>
        <Text style={styles.infoText}>
          Creating account for{' '}
          <Text style={{ color: C.ink, fontWeight: '700' }}>{suEmail}</Text>
        </Text>
        <FField
          label="PASSWORD" value={suPassword} onChange={setSuPassword}
          secureText={!suShowPw} trailing={suShowPw ? 'Hide' : 'Show'}
          onTrailing={() => setSuShowPw(v => !v)}
        />
        {error ? <ErrorBox msg={error} /> : null}
        <PrimaryBtn label="Create Account" onPress={handleCreateAccount} loading={busy} disabled={!suPassword} />
        <SecondaryBtn label="Back" onPress={() => { setSuStep('email'); clearError(); setSuPassword(''); }} />
      </>;
    }

    if (mode === 'signup' && suStep === 'verify') {
      return <>
        <Text style={styles.infoText}>
          We sent a verification code to{' '}
          <Text style={{ color: C.ink, fontWeight: '700' }}>{suEmail}</Text>. Enter it below.
        </Text>
        <FField label="VERIFICATION CODE" value={suCode} onChange={setSuCode} keyboard="number-pad" autoFocus />
        {error ? <ErrorBox msg={error} /> : null}
        <PrimaryBtn label="Verify Email" onPress={handleVerify} loading={busy} disabled={!suCode} />
        <SecondaryBtn label="Back" onPress={() => { setSuStep('password'); clearError(); setSuCode(''); }} />
      </>;
    }

    if (mode === 'username') {
      return <>
        <FField
          label="USERNAME"
          value={username}
          onChange={v => setUsername(v.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
          autoFocus
        />
        <Text style={styles.helperText}>Lowercase letters, numbers, underscores · min 3 chars</Text>
        {error ? <ErrorBox msg={error} /> : null}
        <PrimaryBtn label="Enter ParkQuest" onPress={handleUsername} loading={busy} disabled={username.length < 3} />
      </>;
    }

    if (mode === 'forgot' && fgStep === 'email') {
      return <>
        <FField label="EMAIL" value={fgEmail} onChange={setFgEmail} keyboard="email-address" />
        {error ? <ErrorBox msg={error} /> : null}
        <PrimaryBtn label="Send Reset Code" onPress={handleForgotSend} loading={busy} disabled={!fgEmail} />
        <SecondaryBtn label="Back to Sign In" onPress={() => { setMode('signin'); clearError(); }} />
      </>;
    }

    if (mode === 'forgot' && fgStep === 'verify') {
      return <>
        <Text style={styles.infoText}>
          We sent a reset code to{' '}
          <Text style={{ color: C.ink, fontWeight: '700' }}>{fgEmail}</Text>.
          Enter it with your new password.
        </Text>
        <FField label="RESET CODE" value={fgCode} onChange={setFgCode} autoFocus />
        <FField
          label="NEW PASSWORD" value={fgPassword} onChange={setFgPassword}
          secureText={!fgShowPw} trailing={fgShowPw ? 'Hide' : 'Show'}
          onTrailing={() => setFgShowPw(v => !v)}
        />
        {error ? <ErrorBox msg={error} /> : null}
        <PrimaryBtn label="Reset Password" onPress={handleForgotReset} loading={busy} disabled={!fgCode || !fgPassword} />
        <SecondaryBtn label="Back" onPress={() => { setFgStep('email'); setFgCode(''); clearError(); }} />
      </>;
    }

    return null;
  };

  const showTabs  = mode === 'signin' || mode === 'signup';
  const showTerms = mode === 'signin' || mode === 'signup';

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <HeroSection />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <View style={styles.formPanel}>
            {/* Kicker */}
            <Text style={styles.kicker}>DIGITAL NATIONAL PARK JOURNAL</Text>

            {/* Headline + sub */}
            <Text style={styles.headline}>{headline}</Text>
            <Text style={styles.sub}>{sub}</Text>

            {/* Tab switcher */}
            {showTabs && (
              <View style={styles.tabBar}>
                {(['signin', 'signup'] as const).map(m => {
                  const active = mode === m;
                  return (
                    <TouchableOpacity
                      key={m}
                      onPress={() => switchMode(m)}
                      style={[styles.tab, active && styles.tabActive]}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.tabText, active && styles.tabTextActive]}>
                        {m === 'signin' ? 'Sign In' : 'Create Account'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Form */}
            <View style={{ marginTop: 18 }}>
              {renderForm()}
            </View>

            {/* Terms */}
            {showTerms && (
              <Text style={styles.terms}>
                By continuing you agree to the{' '}
                <Text style={{ color: C.primary, fontWeight: '600' }}>Terms</Text>
                {' '}and{' '}
                <Text style={{ color: C.primary, fontWeight: '600' }}>Privacy Policy</Text>.
              </Text>
            )}
          </View>
        </KeyboardAvoidingView>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bg,
  },

  // Hero
  hero: {
    backgroundColor: C.primaryDeep,
    overflow: 'hidden',
    position: 'relative',
  },
  wordmark: {
    position: 'absolute',
    left: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  wordmarkText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFBF1',
    letterSpacing: -0.4,
  },
  heroBottom: {
    position: 'absolute',
    bottom: 58,
    left: 22,
    right: 22,
  },
  heroKicker: {
    fontFamily: MONO,
    fontSize: 9.5,
    letterSpacing: 2.5,
    color: 'rgba(255,251,241,0.70)',
    fontWeight: '600',
    marginBottom: 8,
  },
  heroHeadline: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFBF1',
    letterSpacing: -0.8,
    lineHeight: 34,
  },

  // Form panel
  formPanel: {
    backgroundColor: C.bg,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 44,
  },
  kicker: {
    fontFamily: MONO,
    fontSize: 9.5,
    letterSpacing: 2,
    color: C.inkMute,
    fontWeight: '600',
  },
  headline: {
    fontSize: 32,
    fontWeight: '800',
    color: C.ink,
    letterSpacing: -0.8,
    marginTop: 8,
    lineHeight: 34,
  },
  sub: {
    fontSize: 14,
    color: C.inkMute,
    marginTop: 6,
  },

  // Tab switcher
  tabBar: {
    flexDirection: 'row',
    backgroundColor: C.surfaceAlt,
    borderRadius: 12,
    padding: 4,
    marginTop: 22,
    gap: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 9,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: C.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.inkMute,
  },
  tabTextActive: {
    color: C.ink,
    fontWeight: '700',
  },

  // OAuth
  oauthRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  oauthBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.surface,
    borderWidth: 0.5,
    borderColor: C.hairline,
    borderRadius: 12,
    paddingVertical: 13,
  },
  oauthBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.ink,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: 0.5,
    backgroundColor: C.hairline,
  },
  dividerText: {
    fontFamily: MONO,
    fontSize: 10,
    letterSpacing: 1.5,
    color: C.inkMute,
    fontWeight: '600',
  },

  // FField
  fField: {
    backgroundColor: C.surface,
    borderWidth: 0.5,
    borderColor: C.hairline,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  fFieldLabel: {
    fontFamily: MONO,
    fontSize: 9,
    letterSpacing: 1.4,
    color: C.inkMute,
    fontWeight: '600',
  },
  fFieldInput: {
    fontSize: 15,
    fontWeight: '500',
    color: C.ink,
    paddingVertical: 2,
    marginTop: 2,
  },
  fFieldTrailingText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.inkMute,
  },

  // Buttons
  primaryBtn: {
    backgroundColor: C.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.30,
    shadowRadius: 16,
    elevation: 8,
  },
  primaryBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFBF1',
  },
  secondaryBtn: {
    borderWidth: 0.5,
    borderColor: C.hairline,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.inkMute,
  },

  // Error / info / misc
  errorBox: {
    backgroundColor: 'rgba(197,107,61,0.10)',
    borderWidth: 0.5,
    borderColor: 'rgba(197,107,61,0.30)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  errorBoxText: {
    fontSize: 12.5,
    color: C.accent,
  },
  infoText: {
    fontSize: 13,
    color: C.inkMute,
    lineHeight: 20,
    marginBottom: 16,
  },
  helperText: {
    fontFamily: MONO,
    fontSize: 9.5,
    letterSpacing: 0.6,
    color: C.inkMute,
    marginBottom: 14,
    marginTop: -4,
  },
  forgotText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.inkMute,
  },
  terms: {
    fontSize: 11.5,
    color: C.inkMute,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 28,
  },
});
