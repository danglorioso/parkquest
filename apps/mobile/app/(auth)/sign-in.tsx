import {
  ActivityIndicator, Animated, Dimensions, Easing, KeyboardAvoidingView,
  Linking, Platform, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOAuth, useSignUp, useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';
import { clerkMsg, ErrorBox, FField, MONO, PrimaryBtn } from '@/components/AuthAtoms';
import { STATIC as C, useColors } from '@/lib/palette';
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

// Topo watermark — same swirling contour lines as the web hero, tiled 420px
const TOPO_TILE = 420;
const TOPO_ROWS = [60, 110, 160, 210, 260, 310, 360, 410];

// Module-level animated values — created once
const _starOp   = STARS.map(([,, op])  => new Animated.Value(op));
const _cloudX   = CLOUDS.map(([w])     => new Animated.Value(-w * SCREEN_W));
const _sunScale = new Animated.Value(0.92);
const _sunOp    = new Animated.Value(0.55);
const _topoShift = new Animated.Value(0);
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
  const T = useColors();
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
      Animated.timing(_sunOp,    { toValue: 0.85, duration: 4000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(_sunOp,    { toValue: 0.55, duration: 4000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.timing(_sunScale, { toValue: 1.10, duration: 3500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(_sunScale, { toValue: 0.92, duration: 3500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();

    // Topo watermark drift — one full tile per cycle, so the loop reset is invisible
    Animated.loop(
      Animated.timing(_topoShift, { toValue: TOPO_TILE, duration: 90000, easing: Easing.linear, useNativeDriver: true }),
    ).start();

    // Shooting stars — fire, 18 s pause, repeat
    const runShoot = (i: number) => {
      const [,,, delay, duration] = SHOOTS[i];
      _shootTx[i].setValue(0); _shootTy[i].setValue(0); _shootOp[i].setValue(0);
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(_shootTx[i], { toValue: -260, duration, easing: Easing.linear, useNativeDriver: true }),
          Animated.timing(_shootTy[i], { toValue:  234, duration, easing: Easing.linear, useNativeDriver: true }),
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
    <View style={[styles.hero, { height: heroH, backgroundColor: T.primaryDeep }]}>

      {/* Topo watermark — drifting contour lines, same pattern as web hero */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute', left: -TOPO_TILE, top: -TOPO_TILE,
          transform: [{ translateX: _topoShift }, { translateY: _topoShift }],
        }}
      >
        <Svg width={SCREEN_W + TOPO_TILE} height={heroH + TOPO_TILE}>
          <Defs>
            <Pattern id="heroTopo" patternUnits="userSpaceOnUse" width={TOPO_TILE} height={TOPO_TILE}>
              <G fill="none" stroke="#FFFBF1" strokeOpacity={0.14} strokeWidth={1}>
                {TOPO_ROWS.map((y) => (
                  <Path key={y} d={`M-20 ${y} Q 60 ${y - 30} 130 ${y} T 280 ${y} T 440 ${y}`} />
                ))}
              </G>
            </Pattern>
          </Defs>
          <Rect x={0} y={0} width={SCREEN_W + TOPO_TILE} height={heroH + TOPO_TILE} fill="url(#heroTopo)" />
        </Svg>
      </Animated.View>

      {/* Sun glow — behind stars/clouds/mountains */}
      <Animated.View style={{
        position: 'absolute', right: SCREEN_W * 0.08, top: insets.top + 20,
        width: 160, height: 160,
        transform: [{ scale: _sunScale }], opacity: _sunOp,
      }}>
        <Svg width={160} height={160} viewBox="0 0 160 160">
          <Defs>
            <RadialGradient id="heroSunG" cx="50%" cy="50%" r="50%">
              <Stop offset="0%"   stopColor="#FFE6A0" stopOpacity="1" />
              <Stop offset="30%"  stopColor="#D89A3A" stopOpacity="0.55" />
              <Stop offset="70%"  stopColor="#D89A3A" stopOpacity="0.12" />
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
          transform: [{ translateX: _shootTx[i] }, { translateY: _shootTy[i] }, { rotate: '-42deg' }],
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

// ── Screen ────────────────────────────────────────────────────────────────────

export default function LandingScreen() {
  const router = useRouter();
  const T = useColors();
  const { user } = useUser();
  const { signUp, setActive } = useSignUp();
  const { startOAuthFlow: googleFlow } = useOAuth({ strategy: 'oauth_google' });
  const { startOAuthFlow: appleFlow  } = useOAuth({ strategy: 'oauth_apple' });

  const [mode,      setMode]      = useState<'landing' | 'username'>('landing');
  const [username,  setUsername]  = useState('');
  const [oauthBusy, setOauthBusy] = useState<'google' | 'apple' | null>(null);
  const [busy,      setBusy]      = useState(false);
  const [error,     setError]     = useState('');
  // Stores the OAuth sign-up object that needs a username to complete.
  const pendingOAuthSignUpRef = useRef<any>(null);
  const pendingSetActiveRef   = useRef<((params: any) => Promise<void>) | null>(null);

  const handleOAuth = async (provider: 'google' | 'apple') => {
    setError('');
    setOauthBusy(provider);
    try {
      const flow = provider === 'google' ? googleFlow : appleFlow;
      const { createdSessionId, setActive: sa, signUp: oauthSU } = await flow();
      if (createdSessionId) {
        // Use flow's setActive, fall back to the hook's setActive (Apple can omit it).
        await (sa ?? setActive)!({ session: createdSessionId });
        router.replace('/(tabs)/feed' as never);
      } else if ((oauthSU as any)?.status === 'missing_requirements') {
        // Store the OAuth sign-up object — useSignUp()'s signUp may not reflect it.
        pendingOAuthSignUpRef.current = oauthSU;
        pendingSetActiveRef.current = (sa ?? setActive) as any;
        setMode('username');
      }
      // else: user cancelled the OAuth sheet — do nothing, no error
    } catch (e) {
      const ce = e as { errors?: { code?: string }[]; code?: string };
      const code = ce?.errors?.[0]?.code ?? ce?.code ?? '';
      // Swallow Apple-specific cancellation signals silently.
      if (code === 'user_cancelled' || code === 'cancelled' || code === 'ERR_REQUEST_CANCELLED') return;
      setError(clerkMsg(e));
    } finally {
      setOauthBusy(null);
    }
  };

  const handleUsername = async () => {
    const uname = username.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (uname.length < 3) return;
    setError('');
    setBusy(true);
    try {
      // Prefer the stored OAuth sign-up object; fall back to useSignUp()'s signUp.
      const pendingSU = pendingOAuthSignUpRef.current ?? signUp;
      const sa = pendingSetActiveRef.current ?? setActive;
      if (pendingSU && pendingSU.status === 'missing_requirements') {
        // OAuth sign-up paused on required fields — no session exists yet,
        // so user.update() is unavailable; finish the sign-up instead.
        const result = await pendingSU.update({ username: uname });
        if (result.status !== 'complete') {
          setError('Could not finish sign-up. Please try again.');
          return;
        }
        await sa!({ session: result.createdSessionId });
      } else if (user) {
        await user.update({ username: uname });
      } else {
        setError('Account not ready yet. Please try again.');
        return;
      }
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
                  <FField label="USERNAME" value={username} onChange={v => setUsername(v.toLowerCase().replace(/[^a-z0-9_]/g, ''))} autoFocus />
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
                      <View style={{ width: 16, height: 16, alignItems: 'center', justifyContent: 'center' }}>
                        {oauthBusy === p
                          ? <ActivityIndicator size="small" color={C.ink} />
                          : p === 'google' ? <GoogleG size={16} /> : <AppleIcon size={16} />
                        }
                      </View>
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

                <PrimaryBtn label="Sign In" onPress={() => router.push('/(auth)/login' as never)} />

                <TouchableOpacity
                  style={[styles.outlineBtn, { borderColor: T.primary }]}
                  onPress={() => router.push('/(auth)/sign-up' as never)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.outlineBtnText, { color: T.primary }]}>Create Account</Text>
                </TouchableOpacity>

                <Text style={styles.terms}>
                  By continuing, you agree to the{' '}
                  <Text style={{ color: T.primary, fontWeight: '600' }} onPress={() => Linking.openURL(`${WEB}/terms`)}>Terms</Text>
                  {' '}and{' '}
                  <Text style={{ color: T.primary, fontWeight: '600' }} onPress={() => Linking.openURL(`${WEB}/privacy`)}>Privacy Policy</Text>.
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
    fontFamily: MONO, fontSize: 13, letterSpacing: 2.5,
    color: 'rgba(255,251,241,0.70)', fontWeight: '600', marginBottom: 8,
  },
  heroHeadline: { fontSize: 32, fontWeight: '800', color: '#FFFBF1', letterSpacing: -0.8, lineHeight: 34 },

  panel: { backgroundColor: C.bg, paddingHorizontal: 24, paddingTop: 28, paddingBottom: 44 },
  kicker: { fontFamily: MONO, fontSize: 13, letterSpacing: 2, color: C.inkMute, fontWeight: '600' },
  headline: { fontSize: 32, fontWeight: '800', color: C.ink, letterSpacing: -0.8, marginTop: 8, lineHeight: 34 },
  sub: { fontSize: 14, color: C.inkMute, marginTop: 6 },

  oauthBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: C.surface,
    borderWidth: 0.5, borderColor: C.hairline,
    borderRadius: 12, paddingVertical: 13, marginBottom: 8, minHeight: 46,
  },
  oauthBtnText: { fontSize: 13, fontWeight: '600', color: C.ink },

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 14 },
  dividerLine: { flex: 1, height: 0.5, backgroundColor: C.hairline },
  dividerText: { fontFamily: MONO, fontSize: 13, letterSpacing: 1.5, color: C.inkMute, fontWeight: '600' },

  outlineBtn: {
    backgroundColor: 'transparent', borderRadius: 14, paddingVertical: 14,
    alignItems: 'center', marginBottom: 10,
    borderWidth: 1.5,
  },
  outlineBtnText: { fontSize: 15, fontWeight: '700' },

  terms: { fontSize: 13, color: C.inkMute, textAlign: 'center', marginTop: 12, lineHeight: 17 },

  helperText: { fontSize: 13, color: C.inkMute, marginBottom: 14 },
});
