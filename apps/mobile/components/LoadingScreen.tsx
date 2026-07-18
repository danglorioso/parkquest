import { useEffect, useRef } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Ellipse, G, Line, Path } from 'react-native-svg';

const { width: W, height: H } = Dimensions.get('window');

const STARS: [number, number, number, number][] = [
  [0.11, 0.09, 0.8, 0],   [0.21, 0.07, 0.7, 500], [0.32, 0.13, 0.6, 1100],
  [0.43, 0.08, 0.85, 1800],[0.59, 0.11, 0.75, 300], [0.70, 0.15, 0.6, 2200],
  [0.16, 0.20, 0.65, 1500],[0.37, 0.20, 0.7, 800],  [0.51, 0.22, 0.55, 2600],
  [0.64, 0.20, 0.7, 1300], [0.11, 0.25, 0.6, 900],  [0.27, 0.29, 0.65, 2100],
  [0.08, 0.16, 0.55, 3200],[0.80, 0.10, 0.7, 1000], [0.93, 0.19, 0.6, 400],
];

function Star({ x, y, size, opacity, delay }: { x: number; y: number; size: number; opacity: number; delay: number }) {
  const anim = useRef(new Animated.Value(opacity)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: opacity * 0.25, duration: 1800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: opacity, duration: 1800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: x * W,
        top: y * H * 0.65,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: '#FFFBF1',
        opacity: anim,
      }}
    />
  );
}

export function CompassSpinner({ size = 44, dark = false }: { size?: number; dark?: boolean }) {
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const spin = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 1600,
        useNativeDriver: true,
      })
    );
    spin.start();
    return () => spin.stop();
  }, []);

  const rotate = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const cx = size / 2;
  const cy = size / 2;
  const r  = size * 0.455;

  const ring1  = dark ? 'rgba(31,61,46,0.20)' : 'rgba(255,251,241,0.30)';
  const ring2  = dark ? 'rgba(31,61,46,0.70)' : 'rgba(255,251,241,0.80)';
  const tick   = dark ? 'rgba(31,61,46,0.55)' : 'rgba(255,251,241,0.60)';
  const north  = dark ? '#1F3D2E' : '#FFFBF1';
  const south  = dark ? 'rgba(31,61,46,0.28)' : 'rgba(255,251,241,0.35)';

  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle cx={cx} cy={cy} r={r} stroke={ring1} strokeWidth="2" fill="none" />
        <Circle cx={cx} cy={cy} r={r} stroke={ring2} strokeWidth="2.5" fill="none"
          strokeDasharray="10 20" strokeLinecap="round" />
        {[0, 90, 180, 270].map((deg) => {
          const rad = Math.PI * deg / 180;
          const x1 = cx + Math.sin(rad) * r * 0.78;
          const y1 = cy - Math.cos(rad) * r * 0.78;
          const x2 = cx + Math.sin(rad) * r;
          const y2 = cy - Math.cos(rad) * r;
          return <Line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke={tick} strokeWidth="2" strokeLinecap="round" />;
        })}
        <Path
          d={`M${cx} ${cy - r * 0.68} L${cx - 3} ${cy} L${cx} ${cy - r * 0.10} L${cx + 3} ${cy} Z`}
          fill={north} opacity={0.95}
        />
        <Path
          d={`M${cx} ${cy + r * 0.68} L${cx - 3} ${cy} L${cx} ${cy + r * 0.10} L${cx + 3} ${cy} Z`}
          fill={south}
        />
        <Circle cx={cx} cy={cy} r="2.5" fill="#D89A3A" />
      </Svg>
    </Animated.View>
  );
}

function CloudLayer() {
  const anim = useRef(new Animated.Value(-W * 0.55)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(anim, {
        toValue: W * 1.1,
        duration: 22000,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: H * 0.18,
        left: 0,
        transform: [{ translateX: anim }],
        opacity: 0.11,
      }}
    >
      <Svg width={W * 0.55} height={58} viewBox="0 0 200 36">
        <Ellipse cx="40" cy="16" rx="32" ry="9" fill="#FFFBF1" />
        <Ellipse cx="82" cy="14" rx="38" ry="10" fill="#FFFBF1" />
        <Ellipse cx="128" cy="17" rx="28" ry="8" fill="#FFFBF1" />
      </Svg>
    </Animated.View>
  );
}

function CloudLayer2() {
  const anim = useRef(new Animated.Value(-W * 0.35)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(anim, {
        toValue: W * 1.2,
        duration: 34000,
        useNativeDriver: true,
      })
    );
    // Offset start
    setTimeout(() => loop.start(), 12000);
    return () => loop.stop();
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: H * 0.26,
        left: 0,
        transform: [{ translateX: anim }],
        opacity: 0.08,
      }}
    >
      <Svg width={W * 0.35} height={44} viewBox="0 0 200 36">
        <Ellipse cx="30" cy="17" rx="22" ry="5" fill="#FFFBF1" />
        <Ellipse cx="75" cy="15" rx="45" ry="7" fill="#FFFBF1" />
        <Ellipse cx="140" cy="16" rx="48" ry="6" fill="#FFFBF1" />
        <Ellipse cx="183" cy="18" rx="18" ry="4" fill="#FFFBF1" />
      </Svg>
    </Animated.View>
  );
}

function SunGlow() {
  const anim = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.85, duration: 4000, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.55, duration: 4000, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        right: W * 0.12,
        top: H * 0.14,
        width: 160,
        height: 160,
        borderRadius: 80,
        backgroundColor: '#D89A3A',
        opacity: anim,
      }}
      // Soft glow via nested layers
    >
      <View style={{
        position: 'absolute',
        inset: 0,
        borderRadius: 80,
        backgroundColor: 'rgba(216,154,58,0.5)',
        transform: [{ scale: 1.4 }],
      }} />
    </Animated.View>
  );
}

export default function LoadingScreen({ visible }: { visible: boolean }) {
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const contentFade = useRef(new Animated.Value(0)).current;
  const contentRise = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    if (!visible) {
      // Exit: zoom-through + fade, like iOS's own launch-screen handoff —
      // the splash swells slightly as it dissolves into the app behind it.
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 450,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1.08,
          duration: 450,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      fadeAnim.setValue(1);
      scaleAnim.setValue(1);
      contentFade.setValue(0);
      contentRise.setValue(16);
      Animated.parallel([
        Animated.timing(contentFade, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.spring(contentRise, { toValue: 0, friction: 7, tension: 40, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[StyleSheet.absoluteFill, { opacity: fadeAnim, transform: [{ scale: scaleAnim }], zIndex: 999 }]}
    >
      <LinearGradient
        colors={['#0D2B1E', '#1F3D2E', '#2A5240']}
        style={StyleSheet.absoluteFill}
      />

      {/* Clouds — rendered before the sun so they drift behind it */}
      <CloudLayer />
      <CloudLayer2 />

      {/* Sun glow behind mountains */}
      <SunGlow />

      {/* Stars */}
      {STARS.map(([x, y, o, delay], i) => (
        <Star key={i} x={x} y={y} size={2 + (i % 3)} opacity={o} delay={delay} />
      ))}

      {/* Mountains — 3 SVG layers */}
      <View style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end' }]}>
        <Svg
          width={W}
          height={H * 0.55}
          viewBox={`0 0 ${W} ${H * 0.55}`}
          style={{ position: 'absolute', bottom: 0 }}
        >
          {/* Far layer */}
          <Path
            d={`M0 ${H * 0.55} L0 ${H * 0.30} L${W * 0.13} ${H * 0.22} L${W * 0.27} ${H * 0.28} L${W * 0.40} ${H * 0.15} L${W * 0.53} ${H * 0.22} L${W * 0.67} ${H * 0.10} L${W * 0.80} ${H * 0.19} L${W * 0.93} ${H * 0.14} L${W} ${H * 0.17} L${W} ${H * 0.55} Z`}
            fill="rgba(0,0,0,0.22)"
          />
          {/* Mid layer */}
          <Path
            d={`M0 ${H * 0.55} L0 ${H * 0.38} L${W * 0.17} ${H * 0.32} L${W * 0.33} ${H * 0.36} L${W * 0.47} ${H * 0.28} L${W * 0.63} ${H * 0.34} L${W * 0.77} ${H * 0.28} L${W * 0.93} ${H * 0.34} L${W} ${H * 0.32} L${W} ${H * 0.55} Z`}
            fill="rgba(0,0,0,0.36)"
          />
          {/* Near layer */}
          <Path
            d={`M0 ${H * 0.55} L0 ${H * 0.46} L${W * 0.20} ${H * 0.43} L${W * 0.40} ${H * 0.44} L${W * 0.60} ${H * 0.42} L${W * 0.80} ${H * 0.44} L${W} ${H * 0.43} L${W} ${H * 0.55} Z`}
            fill="rgba(0,0,0,0.50)"
          />
        </Svg>
      </View>

      {/* Center content — wordmark + spinner */}
      <Animated.View
        style={[
          styles.center,
          { opacity: contentFade, transform: [{ translateY: contentRise }] },
        ]}
      >
        {/* Wordmark */}
        <View style={styles.wordmark}>
          <Svg width={28} height={28} viewBox="0 0 24 24" style={{ marginTop: -2 }}>
            <Path
              d="M3 20L9 9l3 5 3-7 6 13H3z"
              stroke="#FFFBF1"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <Circle cx="20" cy="4" r="3.5" fill="#FFFBF1" />
          </Svg>
          <View style={{ flexDirection: 'row' }}>
            <Animated.Text style={styles.wordmarkBold}>Park</Animated.Text>
            <Animated.Text style={styles.wordmarkLight}>Quest</Animated.Text>
          </View>
        </View>

        {/* Tagline */}
        <View style={styles.tagline}>
          <Animated.Text style={styles.taglineText}>63 PARKS · ONE QUEST</Animated.Text>
        </View>

        {/* Compass spinner */}
        <View style={{ marginTop: 48 }}>
          <CompassSpinner />
        </View>
      </Animated.View>

      {/* Copyright */}
      <Animated.Text style={styles.copyright}>
        © {new Date().getFullYear()} ParkQuest. All rights reserved.
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  copyright: {
    position: 'absolute',
    // Below the near mountain ridge (which crests around 0.91H) so the text
    // sits fully on the darkest layer instead of straddling two shades
    bottom: 44,
    alignSelf: 'center',
    color: 'rgba(255,251,241,0.28)',
    fontSize: 13,
    fontWeight: '400',
    letterSpacing: 0.5,
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  wordmarkBold: {
    color: '#FFFBF1',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  wordmarkLight: {
    color: '#FFFBF1',
    fontSize: 32,
    fontWeight: '400',
    letterSpacing: -0.5,
  },
  tagline: {
    marginTop: 10,
  },
  taglineText: {
    color: 'rgba(255,251,241,0.60)',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 3,
  },
});
