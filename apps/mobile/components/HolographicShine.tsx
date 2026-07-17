import { useCallback } from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { DeviceMotion } from 'expo-sensors';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const AnimatedGradient = Animated.createAnimatedComponent(LinearGradient);

// Clamp range for pitch/roll (radians) — full shimmer sweep happens well
// before the phone is anywhere near flat-on-face or edge-on.
const TILT_RANGE = 0.5;
const UPDATE_MS = 40; // ~25Hz — smooth enough for a sheen, light on the JS bridge

const { width: SCREEN_W } = Dimensions.get('window');
const DIAG = SCREEN_W * 1.7;

// Rainbow foil band — same trick as a trading-card holo sleeve: a diagonal
// gradient strip, oversized and clipped by the card's own overflow:hidden,
// that slides across the surface as the device tilts.
export function HolographicShine() {
  const pitch = useSharedValue(0); // front-back tilt
  const roll  = useSharedValue(0); // left-right tilt

  // Tabs stay mounted when you switch away (no unmountOnBlur), so a plain
  // useEffect would keep the gyro polling in the background forever —
  // useFocusEffect starts/stops the subscription with screen focus instead.
  useFocusEffect(
    useCallback(() => {
      DeviceMotion.setUpdateInterval(UPDATE_MS);
      const sub = DeviceMotion.addListener(({ rotation }) => {
        if (!rotation) return;
        pitch.value = withTiming(rotation.beta,  { duration: UPDATE_MS, easing: Easing.linear });
        roll.value  = withTiming(rotation.gamma, { duration: UPDATE_MS, easing: Easing.linear });
      });
      return () => sub.remove();
    }, [pitch, roll])
  );

  const bandStyle = useAnimatedStyle(() => {
    const tx = interpolate(roll.value,  [-TILT_RANGE, TILT_RANGE], [-DIAG * 0.3, DIAG * 0.3], Extrapolation.CLAMP);
    const ty = interpolate(pitch.value, [-TILT_RANGE, TILT_RANGE], [-DIAG * 0.3, DIAG * 0.3], Extrapolation.CLAMP);
    const tiltMag = Math.min(1, (Math.abs(roll.value) + Math.abs(pitch.value)) / (TILT_RANGE * 1.2));
    return {
      transform: [{ translateX: tx }, { translateY: ty }, { rotate: '28deg' }],
      opacity: interpolate(tiltMag, [0, 1], [0.14, 0.5], Extrapolation.CLAMP),
    };
  });

  return (
    <Animated.View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      <AnimatedGradient
        colors={['#ff6ec7', '#ffd36e', '#6effc0', '#6ec7ff', '#c76eff']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          bandStyle,
          {
            position: 'absolute',
            left: -DIAG * 0.35,
            top: -DIAG * 0.35,
            width: DIAG,
            height: DIAG * 0.4,
          },
        ]}
      />
    </Animated.View>
  );
}
