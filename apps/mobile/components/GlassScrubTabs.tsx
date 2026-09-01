import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { GlassIconBg } from '@/components/GlassIconBg';
import { useColors } from '@/lib/palette';

// Inset between the track's outer edge and the sliding indicator/labels —
// matches the app's other thin glass pills (GlassIconBg callers).
const PAD = 3;
const SPRING = { damping: 20, stiffness: 260, mass: 0.7 };

// Thin Liquid-Glass segmented control whose highlight is a single indicator
// that follows your finger continuously across segments — like the built-in
// iOS mode/segment switchers (Camera's mode strip, Control Center groups).
// Built on react-native-gesture-handler + reanimated, the same combo
// FloatingTabBar.tsx already uses for its own drag-to-select bubble — a
// first pass used the classic PanResponder + JS-driven Animated.Value, but
// its move handler compared the live touch position against this
// component's own `active` PROP, which only updates once React re-renders
// this component after `onChange` round-trips back down — one render
// behind the gesture itself. Near the segment boundary that lag caused
// redundant onChange calls (each one forcing the PARENT, e.g. the whole
// park page, to re-render mid-drag — the actual source of the jitter and
// of the glass rendering appearing to drop out while scrubbing), and a
// release could snap the indicator toward a stale target, parking it on
// the wrong side of the boundary. Reanimated shared values fix this at the
// root: `slotIndex` below is read AND written on the UI thread inside the
// gesture worklet itself, same frame, so there's nothing to race.
export function GlassScrubTabs<T extends string | number>({
  segments, active, onChange,
}: { segments: { key: T; label: string }[]; active: T; onChange: (key: T) => void }) {
  const C = useColors();
  const [innerWidth, setInnerWidth] = useState(0);
  const segWidth = innerWidth > 0 ? innerWidth / segments.length : 0;

  const indexOf = (key: T) => Math.max(0, segments.findIndex(s => s.key === key));

  const indicatorX = useSharedValue(0);
  const slotIndex = useSharedValue(indexOf(active));
  const dragging = useSharedValue(0);

  // Snaps the indicator to the active segment whenever it changes from
  // OUTSIDE a drag (a plain tap elsewhere in the app, the parent switching
  // tabs programmatically, or the very first layout) — skipped mid-drag so
  // this doesn't fight the gesture's own live-follow.
  useEffect(() => {
    if (dragging.value === 1 || segWidth === 0) return;
    const idx = indexOf(active);
    slotIndex.value = idx;
    indicatorX.value = withSpring(idx * segWidth, SPRING);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, segWidth]);

  // Plain JS-thread callbacks the gesture worklet hands off to via runOnJS
  // — Haptics and onChange both need the JS thread, not the UI thread the
  // worklet itself runs on.
  const notify = (key: T) => onChange(key);
  const tick = () => Haptics.selectionAsync();

  const pan = Gesture.Pan()
    .onStart(() => {
      dragging.value = 1;
    })
    .onUpdate(e => {
      if (segWidth === 0) return;
      // e.x is relative to the track View the GestureDetector wraps, which
      // includes the track's own padding — shift into the padded-out inner
      // coordinate space, then center the indicator under the finger.
      const raw = e.x - PAD - segWidth / 2;
      const clamped = Math.min(Math.max(raw, 0), innerWidth - segWidth);
      indicatorX.value = clamped;
      const idx = Math.min(segments.length - 1, Math.max(0, Math.round(clamped / segWidth)));
      if (idx !== slotIndex.value) {
        slotIndex.value = idx;
        runOnJS(tick)();
        runOnJS(notify)(segments[idx].key);
      }
    })
    .onFinalize(() => {
      dragging.value = 0;
      if (segWidth > 0) {
        indicatorX.value = withSpring(slotIndex.value * segWidth, SPRING);
      }
    });

  const indicatorStyle = useAnimatedStyle(() => ({
    width: segWidth,
    transform: [{ translateX: indicatorX.value }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <View
        style={styles.track}
        onLayout={e => setInnerWidth(e.nativeEvent.layout.width - PAD * 2)}
      >
        <GlassIconBg borderRadius={17} interactive={false} />
        {segWidth > 0 && (
          <Animated.View pointerEvents="none" style={[styles.indicator, indicatorStyle]}>
            <GlassIconBg tintColor={C.primary} borderRadius={14} />
          </Animated.View>
        )}
        <View style={styles.row} pointerEvents="none">
          {segments.map(s => (
            <View key={s.key} style={styles.btn}>
              <Text
                style={[styles.text, { color: s.key === active ? C.onPrimary : C.inkMute }]}
                numberOfLines={1}
              >
                {s.label}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 34,
    borderRadius: 17,
    overflow: 'hidden',
    padding: PAD,
  },
  indicator: {
    position: 'absolute',
    left: PAD,
    top: PAD,
    bottom: PAD,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
  },
  btn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 13,
    fontWeight: '700',
  },
});
