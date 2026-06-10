import {
  ActivityIndicator, Animated, Dimensions, Easing, KeyboardAvoidingView,
  Linking, Platform, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOAuth, useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

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
};

const MONO     = 'JetBrainsMono_600SemiBold';
const WEB      = process.env.EXPO_PUBLIC_API_URL ?? 'https://www.parkquest.me';
const SCREEN_W = Dimensions.get('window').width;

// Stars: [left_px, top_px, opacity, delay_ms]
const STARS: [number, number, number, number][] = [
  [48,  38, 0.80, 0],    [132, 28, 0.70, 500],  [210, 55, 0.60, 1000],
  [288, 38, 0.85, 1500], [340, 65, 0.65, 2000], [72,  95, 0.55, 300],
  [175, 80, 0.70, 800],  [255, 95, 0.60, 1200], [320, 32, 0.75, 1700],
  [28,  70, 0.65, 600],  [155, 48, 0.60, 1100], [310, 95, 0.55, 400],
  [90,  50, 0.75, 1900], [230, 30, 0.65, 900],  [360, 85, 0.70, 1400],
];

// Clouds: [widthFrac, topFrac, opacity, durationMs, delayMs, variant]
const CLOUDS: [number, number, number, number, number, number][] = [
  [0.42, 0.14, 0.16, 45000, 0,     0],
  [0.28, 0.32, 0.12, 60000, 12000, 1],
  [0.36, 0.08, 0.09, 50000, 25000, 2],
  [0.48, 0.48, 0.14, 40000, 5000,  0],
  [0.22, 0.24, 0.10, 70000, 38000, 1],
];

// Shooting stars: [rightFrac, top_px, widthPx, delayMs, durationMs]
const SHOOTS: [number, number, number, number, number][] = [
  [0.28, 55, 80, 0,     8000],
  [0.55, 30, 60, 4000,  9000],
  [0.12, 75, 70, 10000, 7000],
];

// Module-level animated values — created once
const _starOp   = STARS.map(([,, op])  => new Animated.Value(op));
const _cloudX   = CLOUDS.map(([w])     => new Animated.Value(-w * SCREEN_W));
const _sunScale = new Animated.Value(1);
const _sunOp    = new Animated.Value(0.55);
const _shootTx  = SHOOTS.map(() => new Animated.Value(0));
const _shootTy  = SHOOTS.map(() => new Animated.Value(0));
const _shootOp  = SHOOTS.map(() => new Animated.Value(0));

// ── Cloud shape ───────────────────────────────────────────────────────────────

function CloudShape({ variant, width }: { variant: number; width: number }) {
  const h = width * (36 / 200);
  return (
    <Svg width={width} height={h} viewBox="0 0 200 36">
      {variant === 1 && <>
        <Ellipse cx="30" cy="17" rx="22" ry="5" fill="white" />
        <Ellipse cx="75" cy="15" rx="45" ry="7" fill="white" />
        <Ellipse cx="140" cy="16" rx="48" ry="6" fill="white" />
        <Ellipse cx="183" cy="18" rx="18" ry="4" fill="white" />
      </>}
      {variant === 2 && <>
        <Ellipse cx="28" cy="19" rx="20" ry="8" fill="white" />
        <Ellipse cx="62" cy="13" rx="28" ry="12" fill="white" />
        <Ellipse cx="102" cy="11" rx="32" ry="13" fill="white" />
        <Ellipse cx="143" cy="14" rx="28" ry="10" fill="white" />
        <Ellipse cx="170" cy="18" rx="18" ry="7" fill="white" />
      </>}
      {variant === 0 && <>
        <Ellipse cx="40" cy="16" rx="32" ry="9" fill="white" />
        <Ellipse cx="82" cy="14" rx="38" ry="10" fill="white" />
        <Ellipse cx="128" cy="17" rx="28" ry="8" fill="white" />
      </>}
    </Svg>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────

function HeroSection() {
  const insets = useSafeAreaInsets();
  const heroH = 280 + insets.top;

  useEffect(() => {
    // Star twinkle — staggered starts, ~3.6 s period
    _starOp.forEach((anim, i) => {
      const [,, baseOp, delay] = STARS[i];
      Animated.sequence([
        Animated.delay(delay),
        Animated.loop(Animated.sequence([
          Animated.timing(anim, { toValue: baseOp * 0.15, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(anim, { toValue: baseOp,        duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])),
      ]).start();
    });

    // Cloud drift — staggered start, loop with instant snap-back
    _cloudX.forEach((anim, i) => {
      const [widthFrac,,, duration, delay] = CLOUDS[i];
      const cloudW = widthFrac * SCREEN_W;
      anim.setValue(-cloudW);
      Animated.sequence([
        Animated.delay(delay),
        Animated.loop(Animated.sequence([
          Animated.timing(anim, { toValue: SCREEN_W + cloudW, duration, easing: Easing.linear, useNativeDriver: true }),
          Animated.timing(anim, { toValue: -cloudW, duration: 100, useNativeDriver: true }),
        ])),
      ]).start();
    });

    // Sun pulse
    Animated.loop(Animated.sequence([
      Animated.timing(_sunOp,    { toValue: 0.45, duration: 2800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(_sunOp,    { toValue: 0.75, duration: 2800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.timing(_sunScale, { toValue: 1.10, duration: 3500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(_sunScale, { toValue: 0.92, duration: 3500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();

    // Shooting stars — fire, 18 s pause, repeat
    const runShoot = (i: number) => {
      const [,,, delay, duration] = SHOOTS[i];
      _shootTx[i].setValue(0); _shootTy[i].setValue(0); _shootOp[i].setValue(0);
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(_shootTx[i], { toValue: -260, duration, easing: Easing.linear, useNativeDriver: true }),
          Animated.timing(_shootTy[i], { toValue:  200, duration, easing: Easing.linear, useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(_shootOp[i], { toValue: 0.85, duration: duration * 0.15, useNativeDriver: true }),
            Animated.timing(_shootOp[i], { toValue: 0,    duration: duration * 0.70, useNativeDriver: true }),
          ]),
        ]),
        Animated.delay(18000),
      ]).start(() => runShoot(i));
    };
    SHOOTS.forEach((_, i) => runShoot(i));
  }, []);

  return (
    <View style={[styles.hero, { height: heroH }]}>

      {/* Sun glow — behind stars/clouds/mountains */}
      <Animated.View style={{
        position: 'absolute', right: SCREEN_W * 0.08, top: insets.top + 20,
        width: 160, height: 160,
        transform: [{ scale: _sunScale }], opacity: _sunOp,
      }}>
        <Svg width={160} height={160} viewBox="0 0 160 160">
          <Defs>
            <RadialGradient id="heroSunG" cx="50%" cy="50%" r="50%">
              <Stop offset="0%"   stopColor="#FFE6A0" stopOpacity="0.55" />
              <Stop offset="30%"  stopColor="#D89A3A" stopOpacity="0.30" />
              <Stop offset="65%"  stopColor="#D89A3A" stopOpacity="0.10" />
              <Stop offset="100%" stopColor="#D89A3A" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx={80} cy={80} r={80} fill="url(#heroSunG)" />
        </Svg>
      </Animated.View>

      {/* Stars */}
      {STARS.map(([x, y], i) => {
        const sz = 2 + (i % 3);
        return (
          <Animated.View key={i} style={{
            position: 'absolute', top: y + insets.top * 0.5, left: x,
            width: sz, height: sz, borderRadius: sz,
            backgroundColor: '#FFFBF1', opacity: _starOp[i],
          }} />
        );
      })}

      {/* Shooting stars */}
      {SHOOTS.map(([rightFrac, topPx, w], i) => (
        <Animated.View key={i} style={{
          position: 'absolute', right: SCREEN_W * rightFrac, top: insets.top + topPx,
          width: w, height: 2,
          opacity: _shootOp[i],
          transform: [{ translateX: _shootTx[i] }, { translateY: _shootTy[i] }],
        }}>
          <Svg width={w} height={2} viewBox={`0 0 ${w} 2`}>
            <Defs>
              <LinearGradient id={`sg${i}`} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0"   stopColor="#FFFBF1" stopOpacity="1" />
                <Stop offset="0.3" stopColor="#FFFBF1" stopOpacity="0.9" />
                <Stop offset="1"   stopColor="#FFFBF1" stopOpacity="0" />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={w} height={2} fill={`url(#sg${i})`} />
          </Svg>
        </Animated.View>
      ))}

      {/* Clouds — in sky, behind mountains */}
      {CLOUDS.map(([widthFrac, topFrac, opacity,,, variant], i) => (
        <Animated.View key={i} style={{
          position: 'absolute', top: topFrac * heroH, left: 0,
          opacity, transform: [{ translateX: _cloudX[i] }],
        }}>
          <CloudShape variant={variant} width={widthFrac * SCREEN_W} />
        </Animated.View>
      ))}

      {/* Mountains — exact SVG paths from web banner */}
      <Svg
        width="100%" height={heroH} viewBox="0 0 600 800"
        preserveAspectRatio="xMidYMax slice"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      >
        <Path d="M0 800 L0 540 L80 430 L160 500 L240 340 L320 440 L400 300 L480 420 L560 360 L600 390 L600 800 Z" fill="rgba(0,0,0,0.20)" />
        <Path d="M0 800 L0 620 L100 540 L200 580 L280 500 L380 560 L460 500 L560 560 L600 540 L600 800 Z"         fill="rgba(0,0,0,0.34)" />
        <Path d="M0 800 L0 700 L120 660 L240 680 L360 650 L480 680 L600 660 L600 800 Z"                           fill="rgba(0,0,0,0.48)" />
      </Svg>

      {/* Wordmark */}
      <View style={[styles.wordmark, { top: insets.top + 18 }]}>
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: -2 }}>
          <Path d="M3 20L9 9l3 5 3-7 6 13H3z" stroke="#FFFBF1" strokeWidth={2.2} />
          <Circle cx={20} cy={4} r={3.5} fill="#FFFBF1" />
        </Svg>
        <Text style={styles.wordmarkText}>Park<Text style={{ fontWeight: '400' }}>Quest</Text></Text>
      </View>

      {/* Tagline */}
      <View style={styles.heroBottom}>
        <Text style={styles.heroKicker}>63 PARKS · ONE QUEST</Text>
        <Text style={styles.heroHeadline}>Every park.{'\n'}One journal.</Text>
      </View>
    </View>
  );
}

// ── Google G logo ─────────────────────────────────────────────────────────────

function GoogleG({ size = 16 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <Path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <Path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <Path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </Svg>
  );
}

// ── Apple logo ────────────────────────────────────────────────────────────────

function AppleIcon({ size = 16 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={C.ink}>
      <Path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </Svg>
  );
}

// ── Atoms ─────────────────────────────────────────────────────────────────────

function FField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.fField}>
      <Text style={styles.fFieldLabel}>{label}</Text>
      <TextInput
        style={styles.fFieldInput}
        value={value}
        onChangeText={onChange}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
      />
    </View>
  );
}

function PrimaryBtn({ label, onPress, loading = false, disabled = false }: {
  label: string; onPress: () => void; loading?: boolean; disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress} disabled={loading || disabled}
      style={[styles.primaryBtn, (loading || disabled) && { opacity: 0.65 }]}
      activeOpacity={0.85}
    >
      {loading
        ? <ActivityIndicator color="#FFFBF1" size="small" />
        : <Text style={styles.primaryBtnText}>{label}</Text>}
    </TouchableOpacity>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <View style={styles.errorBox}>
      <Text style={styles.errorBoxText}>{msg}</Text>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function LandingScreen() {
  const router = useRouter();
  const { user } = useUser();
  const { startOAuthFlow: googleFlow } = useOAuth({ strategy: 'oauth_google' });
  const { startOAuthFlow: appleFlow  } = useOAuth({ strategy: 'oauth_apple' });

  const [mode,      setMode]      = useState<'landing' | 'username'>('landing');
  const [username,  setUsername]  = useState('');
  const [oauthBusy, setOauthBusy] = useState<'google' | 'apple' | null>(null);
  const [busy,      setBusy]      = useState(false);
  const [error,     setError]     = useState('');

  const clerkMsg = (e: unknown) => {
    const ce = e as { errors?: { message?: string; longMessage?: string }[] };
    return ce?.errors?.[0]?.longMessage ?? ce?.errors?.[0]?.message ?? 'Something went wrong.';
  };

  const handleOAuth = async (provider: 'google' | 'apple') => {
    setError('');
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

  const handleUsername = async () => {
    if (!user || username.length < 3) return;
    setError('');
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

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <HeroSection />

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.panel}>

            {mode === 'username' ? (
              <>
                <Text style={styles.kicker}>ALMOST THERE</Text>
                <Text style={styles.headline}>One last thing.</Text>
                <Text style={styles.sub}>Choose a username for your profile.</Text>
                <View style={{ marginTop: 24 }}>
                  <FField label="USERNAME" value={username} onChange={v => setUsername(v.toLowerCase().replace(/[^a-z0-9_]/g, ''))} />
                  <Text style={styles.helperText}>Lowercase letters, numbers, underscores · min 3 chars</Text>
                  {error ? <ErrorBox msg={error} /> : null}
                  <PrimaryBtn label="Enter ParkQuest" onPress={handleUsername} loading={busy} disabled={username.length < 3} />
                </View>
              </>
            ) : (
              <>
                <Text style={styles.kicker}>DIGITAL NATIONAL PARK JOURNAL</Text>
                <Text style={styles.headline}>Your parks await.</Text>
                <Text style={styles.sub}>Track every visit, badge, and memory.</Text>

                {/* OAuth */}
                <View style={{ marginTop: 24 }}>
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
                        : p === 'google' ? <GoogleG size={16} /> : <AppleIcon size={16} />
                      }
                      <Text style={styles.oauthBtnText}>
                        Continue with {p === 'apple' ? 'Apple' : 'Google'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {error ? <ErrorBox msg={error} /> : null}

                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>OR</Text>
                  <View style={styles.dividerLine} />
                </View>

                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={() => router.push('/(auth)/login' as never)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.primaryBtnText}>Sign In</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.outlineBtn}
                  onPress={() => router.push('/(auth)/sign-up' as never)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.outlineBtnText}>Create Account</Text>
                </TouchableOpacity>

                <Text style={styles.terms}>
                  By continuing you agree to the{' '}
                  <Text style={{ color: C.primary, fontWeight: '600' }} onPress={() => Linking.openURL(`${WEB}/terms`)}>Terms</Text>
                  {' '}and{' '}
                  <Text style={{ color: C.primary, fontWeight: '600' }} onPress={() => Linking.openURL(`${WEB}/privacy`)}>Privacy Policy</Text>.
                </Text>
              </>
            )}

          </View>
        </KeyboardAvoidingView>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },

  hero: {
    backgroundColor: C.primaryDeep,
    overflow: 'hidden',
    position: 'relative',
  },
  wordmark: {
    position: 'absolute', left: 22,
    flexDirection: 'row', alignItems: 'center', gap: 7,
  },
  wordmarkText: { fontSize: 20, fontWeight: '800', color: '#FFFBF1', letterSpacing: -0.4 },
  heroBottom: { position: 'absolute', bottom: 58, left: 22, right: 22 },
  heroKicker: {
    fontFamily: MONO, fontSize: 9.5, letterSpacing: 2.5,
    color: 'rgba(255,251,241,0.70)', fontWeight: '600', marginBottom: 8,
  },
  heroHeadline: { fontSize: 32, fontWeight: '800', color: '#FFFBF1', letterSpacing: -0.8, lineHeight: 34 },

  panel: { backgroundColor: C.bg, paddingHorizontal: 24, paddingTop: 28, paddingBottom: 44 },
  kicker: { fontFamily: MONO, fontSize: 9.5, letterSpacing: 2, color: C.inkMute, fontWeight: '600' },
  headline: { fontSize: 32, fontWeight: '800', color: C.ink, letterSpacing: -0.8, marginTop: 8, lineHeight: 34 },
  sub: { fontSize: 14, color: C.inkMute, marginTop: 6 },

  oauthBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: C.surface,
    borderWidth: 0.5, borderColor: C.hairline,
    borderRadius: 12, paddingVertical: 13, marginBottom: 8,
  },
  oauthBtnText: { fontSize: 13, fontWeight: '600', color: C.ink },

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 14 },
  dividerLine: { flex: 1, height: 0.5, backgroundColor: C.hairline },
  dividerText: { fontFamily: MONO, fontSize: 10, letterSpacing: 1.5, color: C.inkMute, fontWeight: '600' },

  primaryBtn: {
    backgroundColor: C.primary, borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', marginBottom: 10,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFBF1' },

  outlineBtn: {
    backgroundColor: 'transparent', borderRadius: 14, paddingVertical: 14,
    alignItems: 'center', marginBottom: 10,
    borderWidth: 1.5, borderColor: C.primary,
  },
  outlineBtnText: { fontSize: 15, fontWeight: '700', color: C.primary },

  terms: { fontSize: 11.5, color: C.inkMute, textAlign: 'center', marginTop: 12, lineHeight: 17 },

  fField: {
    backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.hairline,
    borderRadius: 12, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, marginBottom: 10,
  },
  fFieldLabel: { fontFamily: MONO, fontSize: 9, letterSpacing: 1.4, color: C.inkMute, fontWeight: '600' },
  fFieldInput: { fontSize: 15, color: C.ink, paddingTop: 4 },
  helperText: { fontSize: 11.5, color: C.inkMute, marginBottom: 14 },
  errorBox: {
    backgroundColor: 'rgba(197,107,61,0.10)', borderRadius: 10,
    borderWidth: 0.5, borderColor: 'rgba(197,107,61,0.30)',
    padding: 12, marginBottom: 12,
  },
  errorBoxText: { fontSize: 13, color: '#C04040' },
});
