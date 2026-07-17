import { useRef } from 'react';
import {
  Animated, Pressable,
  type PressableProps, type StyleProp, type ViewStyle,
} from 'react-native';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Touchable for the round Liquid Glass icon buttons: swells while held
// (Instagram-style press feedback) instead of TouchableOpacity's opacity dim.
// Two reasons scale > dim here: it matches how interactive glass behaves in
// Apple's own apps, and dimming an ancestor of a GlassView kills the live
// glass material entirely (UIKit disables the effect under alpha < 1).
export function GrowTouchable({
  grow = 1.15, style, children, ...rest
}: Omit<PressableProps, 'style'> & {
  grow?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const springTo = (v: number) =>
    Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 30, bounciness: 9 }).start();
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e) => { springTo(grow); rest.onPressIn?.(e); }}
      onPressOut={(e) => { springTo(1); rest.onPressOut?.(e); }}
      style={[style, { transform: [{ scale }] }]}
    >
      {children}
    </AnimatedPressable>
  );
}
