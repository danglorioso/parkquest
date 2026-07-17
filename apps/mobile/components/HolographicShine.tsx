import { useCallback, useMemo, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { DeviceMotion } from 'expo-sensors';
import { useFocusEffect } from 'expo-router';
import Svg, {
  Circle, Defs, G, Line, LinearGradient, Path,
  RadialGradient, Rect, Stop, Text as SvgText,
} from 'react-native-svg';

const TILT_RANGE = 0.5; // radians — full shimmer sweep well before edge-on
const UPDATE_MS  = 40;  // ~25Hz — smooth enough for a sheen, light on the JS bridge

const TILT_A = -14; // primary guilloche family — also carries the shimmer
const TILT_B = 11;  // secondary family, crossing the first for a woven look

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
function mapRange(v: number, inLo: number, inHi: number, outLo: number, outHi: number) {
  const t = clamp((v - inLo) / (inHi - inLo), 0, 1);
  return outLo + t * (outHi - outLo);
}

// One proven wave-hump shape, 400 units wide — tiled horizontally across
// whatever span is needed, so density scales with the card's real measured
// size instead of a hardcoded viewBox. (A fixed viewBox that didn't match
// the card's actual on-screen aspect ratio previously cropped/misaligned
// the seal and edge text under preserveAspectRatio="slice" — this
// component measures itself via onLayout and builds geometry from the
// real width/height, so there's nothing left to mismatch.)
const SEG_SPAN = 400;
const waveSegD = (xOffset: number, y: number, amp: number) =>
  `M${xOffset - 20} ${y} C ${xOffset + 40} ${y - amp}, ${xOffset + 80} ${y + amp}, ${xOffset + 120} ${y} ` +
  `S ${xOffset + 200} ${y - amp}, ${xOffset + 240} ${y} S ${xOffset + 320} ${y + amp}, ${xOffset + 380} ${y}`;

function tiledWaveD(y: number, xStart: number, xEnd: number, amp: number): string {
  let d = '';
  for (let x = xStart; x < xEnd; x += SEG_SPAN) d += waveSegD(x, y, amp) + ' ';
  return d;
}

function waveRows(w: number, h: number, yStart: number, rowGap: number, amp: number): string[] {
  const xStart = -0.6 * w;
  const xEnd   = 1.6 * w;
  const rows: string[] = [];
  for (let y = yStart; y < 1.6 * h; y += rowGap) rows.push(tiledWaveD(y, xStart, xEnd, amp));
  return rows;
}

// Compass-ring + mountain + sun — a simplified line-art take on the app
// icon, used as an engraved "official seal" watermark. Proportioned off
// its own radius so it scales cleanly with the measured card size.
function SealMark({ cx, cy, r, stroke, strokeWidth = 1 }: {
  cx: number; cy: number; r: number; stroke: string; strokeWidth?: number;
}) {
  const ticks = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    return {
      x1: cx + Math.cos(a) * (r - r * 0.18), y1: cy + Math.sin(a) * (r - r * 0.18),
      x2: cx + Math.cos(a) * (r + r * 0.06), y2: cy + Math.sin(a) * (r + r * 0.06),
    };
  });
  const mtn =
    `M${cx - r * 0.63} ${cy + r * 0.47} L${cx - r * 0.21} ${cy - r * 0.26} L${cx} ${cy + r * 0.05} ` +
    `L${cx + r * 0.24} ${cy - r * 0.42} L${cx + r * 0.63} ${cy + r * 0.47} Z`;
  return (
    <G>
      <Circle cx={cx} cy={cy} r={r} stroke={stroke} strokeWidth={strokeWidth} fill="none" />
      <Circle cx={cx} cy={cy} r={r * 1.16} stroke={stroke} strokeWidth={strokeWidth * 0.6} fill="none" opacity={0.6} />
      {ticks.map((t, i) => (
        <Line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={stroke} strokeWidth={strokeWidth} />
      ))}
      <Path d={mtn} stroke={stroke} strokeWidth={strokeWidth} fill="none" />
      <Circle cx={cx + r * 0.34} cy={cy - r * 0.34} r={r * 0.145} stroke={stroke} strokeWidth={strokeWidth} fill="none" />
    </G>
  );
}

// Cover background: a dense, two-angle guilloche lattice (like currency/
// passport security print), a soft static spotlight/vignette for depth, an
// engraved compass/mountain seal, and a holo micro-print strip on the right
// edge — all behind the cover's text siblings by plain document order (this
// renders as their first sibling).
//
// The shimmer is a second, identical copy of the wave/seal/text art (in
// holo-gradient color) layered on top of the static gold base copy, inside
// a plain Animated.View whose opacity/translateX/Y respond to device tilt.
// Deliberately NOT using Reanimated's useAnimatedProps on the SVG gradient/
// group/text here — animating those directly aborts the app (SIGABRT in
// reanimated::ReanimatedCommitHook::shadowTreeWillCommit; react-native-svg's
// Defs/paint-server + group elements aren't safe targets for Reanimated's
// Fabric prop-commit path on this RN/reanimated/svg version combo). Plain
// RN Animated on a normal View only ever touches opacity/transform, which
// is the standard, safe path.
export function HolographicShine() {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const shift = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const glow  = useRef(new Animated.Value(0.15)).current;

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize(prev => (prev && prev.w === width && prev.h === height) ? prev : { w: width, h: height });
  }, []);

  const w = size?.w ?? 0;
  const h = size?.h ?? 0;

  // Tabs stay mounted when you switch away (no unmountOnBlur), so a plain
  // useEffect would keep the gyro polling in the background forever —
  // useFocusEffect starts/stops the subscription with screen focus instead.
  useFocusEffect(
    useCallback(() => {
      if (!size) return; // wait for a measured layout before we have a px range to map into
      DeviceMotion.setUpdateInterval(UPDATE_MS);
      const sub = DeviceMotion.addListener(({ rotation }) => {
        if (!rotation) return;
        const { beta, gamma } = rotation;
        const tx = mapRange(gamma, -TILT_RANGE, TILT_RANGE, -w * 0.05, w * 0.05);
        const ty = mapRange(beta,  -TILT_RANGE, TILT_RANGE, -h * 0.14, h * 0.14);
        const tiltMag = clamp((Math.abs(gamma) + Math.abs(beta)) / (TILT_RANGE * 1.2), 0, 1);
        Animated.timing(shift, {
          toValue: { x: tx, y: ty }, duration: UPDATE_MS, easing: Easing.linear, useNativeDriver: true,
        }).start();
        Animated.timing(glow, {
          toValue: 0.15 + tiltMag * 0.4, duration: UPDATE_MS, easing: Easing.linear, useNativeDriver: true,
        }).start();
      });
      return () => sub.remove();
    }, [size, w, h, shift, glow])
  );

  const layers = useMemo(() => {
    if (!size) return null;
    const rowsA = waveRows(w, h, -0.6 * h,           h / 9,   h * 0.11); // primary — shimmers
    const rowsB = waveRows(w, h, -0.6 * h + h / 17,   h / 7.6, h * 0.08); // secondary — static crosshatch
    return {
      rowsA, rowsB,
      sealCx: w * 0.82, sealCy: h * 0.5, sealR: h * 0.42,
    };
  }, [size, w, h]);

  return (
    <View style={StyleSheet.absoluteFillObject} onLayout={onLayout} pointerEvents="none">
      {size && layers && (
        <>
          <Svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} pointerEvents="none">
            <Defs>
              <RadialGradient id="spotlight" cx="18%" cy="8%" r="70%">
                <Stop offset="0" stopColor="#fff8e6" stopOpacity={0.16} />
                <Stop offset="1" stopColor="#fff8e6" stopOpacity={0} />
              </RadialGradient>
              <RadialGradient id="vignette" cx="88%" cy="100%" r="75%">
                <Stop offset="0" stopColor="#000000" stopOpacity={0.24} />
                <Stop offset="1" stopColor="#000000" stopOpacity={0} />
              </RadialGradient>
            </Defs>

            {/* Ambient depth — fixed light source, doesn't move with tilt */}
            <Rect x={0} y={0} width={w} height={h} fill="url(#spotlight)" />
            <Rect x={0} y={0} width={w} height={h} fill="url(#vignette)" />

            {/* Secondary crosshatch family — static, crossing angle, denser/thinner.
                Kept faint — this cover now carries real stats/numbers, not just
                decorative identity text, so the pattern has to stay well behind
                it in contrast, not compete with it. */}
            <G rotation={TILT_B} origin={[w / 2, h / 2]}>
              {layers.rowsB.map((d, i) => (
                <Path key={i} d={d} stroke="rgba(201,169,74,0.025)" strokeWidth={0.6} fill="none" />
              ))}
            </G>

            {/* Primary family + seal — static gold base, always visible */}
            <G rotation={TILT_A} origin={[w / 2, h / 2]}>
              {layers.rowsA.map((d, i) => (
                <Path key={i} d={d} stroke="rgba(201,169,74,0.045)" strokeWidth={1} fill="none" />
              ))}
              <SealMark cx={layers.sealCx} cy={layers.sealCy} r={layers.sealR} stroke="rgba(201,169,74,0.07)" />
            </G>
          </Svg>

          {/* Holo shimmer copy — plain Animated.View, opacity + a small
              tilt-driven translate; never touches SVG native props directly */}
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFillObject,
              { opacity: glow, transform: shift.getTranslateTransform() },
            ]}
          >
            <Svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} pointerEvents="none">
              <Defs>
                <LinearGradient id="holo" gradientUnits="userSpaceOnUse" x1={-w * 0.2} y1={0} x2={w * 1.2} y2={h}>
                  <Stop offset="0"    stopColor="#ff6ec7" />
                  <Stop offset="0.25" stopColor="#ffd36e" />
                  <Stop offset="0.5"  stopColor="#6effc0" />
                  <Stop offset="0.75" stopColor="#6ec7ff" />
                  <Stop offset="1"    stopColor="#c76eff" />
                </LinearGradient>
              </Defs>

              <G rotation={TILT_A} origin={[w / 2, h / 2]}>
                {layers.rowsA.map((d, i) => (
                  <Path key={i} d={d} stroke="url(#holo)" strokeWidth={1.2} fill="none" />
                ))}
                <SealMark cx={layers.sealCx} cy={layers.sealCy} r={layers.sealR} stroke="url(#holo)" />
              </G>

              {/* Micro-print security strip, upright along the right edge */}
              <SvgText
                x={w - 10}
                y={h / 2}
                fontSize={Math.max(8, h * 0.08)}
                fontWeight="700"
                letterSpacing={2}
                textAnchor="middle"
                fill="url(#holo)"
                transform={`rotate(-90, ${w - 10}, ${h / 2})`}
              >
                PARKQUEST
              </SvgText>
            </Svg>
          </Animated.View>
        </>
      )}
    </View>
  );
}
