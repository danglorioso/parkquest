import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { STATIC, colorStr, dyn, useColors } from '@/lib/palette';
import { GlassView, GlassContainer, liquidGlassAvailable } from '@/lib/glass';

const PILL_HEIGHT = 62;
const PILL_MARGIN_H = 18;
// Inset the row of tabs from the pill's rounded ends. Also widens the
// highlight bubble (see bubbleW): each extra point here adds two points
// of bubble width to keep the end gap equal to the top/bottom gap.
const PILL_PADDING_H = 6;
// Highlight is a stadium (capsule) sized to cover icon + label with breathing room
const BUBBLE_W = 60; // pre-layout fallback; real width derives from slot geometry
const BUBBLE_H = 52;
// Gap between the bubble and the pill edge — same above/below as at the ends
const EDGE_GAP = (PILL_HEIGHT - BUBBLE_H) / 2;

const SPRING = { damping: 16, stiffness: 220, mass: 0.7 };
// Critically damped so the bubble settles onto the target slot without
// sliding past it and springing back (critical damping ≈ 2√(k·m) ≈ 25)
const SLIDE_SPRING = { damping: 26, stiffness: 220, mass: 0.7 };

function bottomOffset(insetBottom: number) {
  return Math.max(insetBottom - 8, 12);
}

/**
 * Vertical space the floating pill occupies above the screen edge.
 * Scrollable screens under the tabs should use this as their bottom
 * content padding so the last items can scroll clear of the bar.
 */
export function useTabBarSpace() {
  const insets = useSafeAreaInsets();
  return bottomOffset(insets.bottom) + PILL_HEIGHT + 12;
}

export default function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const C = useColors();
  const isDark = useColorScheme() === 'dark';
  const [pillW, setPillW] = useState(0);
  const glass = liquidGlassAvailable && GlassView != null && GlassContainer != null;

  const routes = state.routes;
  const slotW = pillW > 0 ? (pillW - PILL_PADDING_H * 2) / routes.length : 0;
  // Width such that on the first/last slot the bubble's edge sits EDGE_GAP
  // from the pill's end, matching the vertical gap; bubble stays centered
  // on the slot so icons don't shift inside it.
  const bubbleW = slotW > 0 ? slotW + (PILL_PADDING_H - EDGE_GAP) * 2 : BUBBLE_W;

  // Slot indices the glass bubble can land on (everything except the FAB slot)
  const navigable = useMemo(
    () =>
      routes
        .map((r, i) => (descriptors[r.key].options.tabBarButton ? -1 : i))
        .filter((i) => i >= 0),
    [routes, descriptors],
  );
  // The FAB (log-visit) slot — excluded from `navigable` since it's not a
  // real tab, but it still sits visually on top of the bar, so a drag
  // passing under it should still get a haptic tick.
  const fabIndex = useMemo(
    () => routes.findIndex((r) => descriptors[r.key].options.tabBarButton),
    [routes, descriptors],
  );

  const bubbleCx = useSharedValue(-1000);
  const bubbleScale = useSharedValue(1);
  // Velocity-driven squash & stretch: >1 = wider and flatter while sliding fast
  const stretch = useSharedValue(1);
  const dragging = useSharedValue(0);
  const slot = useSharedValue(state.index);
  const overFab = useSharedValue(0);

  useEffect(() => {
    slot.value = state.index;
    if (slotW === 0) return;
    const cx = PILL_PADDING_H + slotW * (state.index + 0.5);
    if (bubbleCx.value < -500) {
      // First layout: place instantly instead of flying in from off-screen
      bubbleCx.value = cx;
    } else if (dragging.value === 0) {
      bubbleCx.value = withSpring(cx, SLIDE_SPRING);
    }
  }, [state.index, slotW]);

  const switchTo = useCallback(
    (index: number) => {
      const route = routes[index];
      navigation.navigate(route.name, route.params);
    },
    [routes, navigation],
  );

  const tick = useCallback(() => {
    Haptics.selectionAsync();
  }, []);

  // Dropping the drag on the FAB slot opens the log-visit modal, same
  // destination as tapping the FAB itself — the slot has no navigable
  // index of its own, so this can't go through switchTo/navigation.navigate.
  const openLogVisit = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/(modals)/log-visit');
  }, [router]);

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-16, 16])
    .onStart(() => {
      dragging.value = 1;
      overFab.value = 0;
      bubbleScale.value = withSpring(1.15, SPRING);
    })
    .onUpdate((e) => {
      if (slotW === 0) return;
      const x = Math.min(
        Math.max(e.x, PILL_PADDING_H + slotW / 2),
        pillW - PILL_PADDING_H - slotW / 2,
      );
      bubbleCx.value = x;
      // Ease toward a velocity-based stretch so jittery velocity reads smoothly
      const target = 1 + Math.min(Math.abs(e.velocityX) / 1100, 0.5);
      stretch.value = stretch.value + (target - stretch.value) * 0.25;
      let best = slot.value;
      let bestDist = Number.MAX_VALUE;
      for (const i of navigable) {
        const d = Math.abs(PILL_PADDING_H + slotW * (i + 0.5) - x);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }
      if (best !== slot.value) {
        slot.value = best;
        runOnJS(tick)();
      }
      // FAB sits on top of the bar but has no navigable slot of its own —
      // fire a tick when the drag crosses under it so it still reads as a
      // real button in the sweep.
      if (fabIndex >= 0) {
        const fabStart = PILL_PADDING_H + slotW * fabIndex;
        const isOverFab = x >= fabStart && x <= fabStart + slotW ? 1 : 0;
        if (isOverFab !== overFab.value) {
          overFab.value = isOverFab;
          if (isOverFab === 1) runOnJS(tick)();
        }
      }
    })
    .onEnd(() => {
      // Navigate only once the finger lifts, not while sliding
      if (overFab.value === 1) {
        runOnJS(openLogVisit)();
      } else {
        runOnJS(switchTo)(slot.value);
      }
    })
    .onFinalize(() => {
      dragging.value = 0;
      overFab.value = 0;
      bubbleScale.value = withSpring(1, SPRING);
      stretch.value = withSpring(1, SPRING);
      if (slotW > 0) {
        bubbleCx.value = withSpring(PILL_PADDING_H + slotW * (slot.value + 0.5), SLIDE_SPRING);
      }
    });

  // Stretch by animating width at a fixed corner radius: the droplet gets
  // wider with straight edges (stadium), instead of scaling into an oval.
  const bubbleStyle = useAnimatedStyle(() => {
    const w = bubbleW * stretch.value;
    const h = BUBBLE_H * (1 - (stretch.value - 1) * 0.5);
    return {
      opacity: pillW > 0 ? 1 : 0,
      width: w,
      height: h,
      top: (PILL_HEIGHT - h) / 2,
      transform: [
        { translateX: bubbleCx.value - w / 2 },
        { scale: bubbleScale.value },
      ],
    };
  });

  const bubble = (
    <Animated.View style={[styles.bubble, bubbleStyle]} pointerEvents="none">
      {glass && GlassView ? (
        <GlassView style={styles.bubbleFill} glassEffectStyle="regular" isInteractive />
      ) : (
        <View
          style={[
            styles.bubbleFill,
            styles.bubbleFallback,
            { backgroundColor: `${C.primary}14` },
          ]}
        />
      )}
    </Animated.View>
  );

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: bottomOffset(insets.bottom) }]}
    >
      <GestureDetector gesture={pan}>
        <View
          style={[styles.pill, glass && styles.pillGlass]}
          onLayout={(e) => setPillW(e.nativeEvent.layout.width)}
        >
          {glass && GlassView && GlassContainer ? (
            /* Bar material and highlight bubble share one GlassContainer:
               two stacked GlassViews outside a container can't sample each
               other and the lower one renders opaque white. The container is
               also what lets the shapes melt together the way Apple's own
               tab bar selection does. */
            <GlassContainer style={StyleSheet.absoluteFill} pointerEvents="none">
              <GlassView
                style={[StyleSheet.absoluteFill, { borderRadius: PILL_HEIGHT / 2 }]}
                glassEffectStyle="regular"
              />
              {bubble}
            </GlassContainer>
          ) : (
            <>
              <View style={styles.bg} pointerEvents="none">
                {Platform.OS === 'ios' && (
                  <BlurView
                    intensity={90}
                    tint={isDark ? 'systemUltraThinMaterialDark' : 'systemUltraThinMaterialLight'}
                    style={StyleSheet.absoluteFill}
                  />
                )}
                <View
                  style={[
                    StyleSheet.absoluteFill,
                    {
                      backgroundColor:
                        Platform.OS === 'ios'
                          ? (isDark ? 'rgba(32,29,23,0.18)' : 'rgba(255,251,241,0.18)')
                          : 'rgba(255,251,241,0.92)',
                    },
                  ]}
                />
              </View>
              {bubble}
            </>
          )}

          <View style={styles.row}>
            {routes.map((route, index) => {
              const { options } = descriptors[route.key];

              if (options.tabBarButton) {
                return (
                  <View key={route.key} style={styles.slot}>
                    {options.tabBarButton({} as never)}
                  </View>
                );
              }

              const focused = state.index === index;
              return (
                <Pressable
                  key={route.key}
                  style={styles.slot}
                  accessibilityRole="button"
                  accessibilityState={focused ? { selected: true } : {}}
                  accessibilityLabel={options.title ?? route.name}
                  onPress={() => {
                    const event = navigation.emit({
                      type: 'tabPress',
                      target: route.key,
                      canPreventDefault: true,
                    });
                    if (!focused && !event.defaultPrevented) {
                      Haptics.selectionAsync();
                      navigation.navigate(route.name, route.params);
                    }
                  }}
                >
                  {options.tabBarIcon?.({
                    focused,
                    color: focused ? C.primary : colorStr(STATIC.inkMute),
                    size: 25,
                  })}
                  <Text
                    numberOfLines={1}
                    style={[styles.label, { color: focused ? C.primary : STATIC.inkMute }]}
                  >
                    {options.title ?? route.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: PILL_MARGIN_H,
    right: PILL_MARGIN_H,
    alignItems: 'stretch',
  },
  pill: {
    height: PILL_HEIGHT,
    borderRadius: PILL_HEIGHT / 2,
    shadowColor: '#1B1A16',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 12,
  },
  // Liquid glass draws its own material, rim light, and depth; an RN shadow
  // on an ancestor flattens the live effect into a static snapshot
  pillGlass: {
    shadowOpacity: 0,
    elevation: 0,
  },
  bg: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: PILL_HEIGHT / 2,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: STATIC.hairline,
    backgroundColor: dyn('rgba(255,251,241,0.3)', 'rgba(32,29,23,0.35)'),
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: PILL_PADDING_H,
  },
  slot: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  bubble: {
    position: 'absolute',
    left: 0,
  },
  bubbleFill: {
    flex: 1,
    // Fixed radius: corner curvature stays constant while the width animates
    borderRadius: BUBBLE_H / 2,
    overflow: 'hidden',
  },
  bubbleFallback: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.7)',
  },
});
