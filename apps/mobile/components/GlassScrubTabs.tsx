import { useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { GlassIconBg } from '@/components/GlassIconBg';
import { useColors } from '@/lib/palette';

// Inset between the track's outer edge and the sliding indicator/labels —
// matches the app's other thin glass pills (GlassIconBg callers).
const PAD = 3;

// Thin Liquid-Glass segmented control whose highlight is a single indicator
// that follows your finger continuously across segments — like the built-in
// iOS mode/segment switchers (Camera's mode strip, Control Center groups) —
// rather than each segment independently drawing its own active state.
// A single PanResponder owns the whole track (segments themselves are
// non-touchable Views) specifically so a plain tap and a drag are the same
// gesture at different lengths: both start with onPanResponderGrant, which
// already moves the indicator toward the touch point, so a tap with zero
// movement is just the degenerate case of a drag.
export function GlassScrubTabs<T extends string | number>({
  segments, active, onChange,
}: { segments: { key: T; label: string }[]; active: T; onChange: (key: T) => void }) {
  const C = useColors();
  const [innerWidth, setInnerWidth] = useState(0);
  const segWidth = innerWidth > 0 ? innerWidth / segments.length : 0;
  const indicatorX = useRef(new Animated.Value(0)).current;
  const draggingRef = useRef(false);
  // PanResponder.create below runs exactly once (inside a useRef
  // initializer) — its callbacks are plain closures fixed at THAT render,
  // so reading segments/segWidth/active/onChange directly would freeze
  // them at their very first values (innerWidth/segWidth are still 0 pre-
  // layout on mount), permanently no-op'ing every future tap: taps were
  // registering fine, but `if (segWidth === 0) return` bailed out every
  // time, which is why the switcher looked stuck on the first segment no
  // matter where you tapped. Mirroring the latest render's values into a
  // ref every render (same pattern as this app's loadDataRef/loadWeatherRef
  // in park/[id].tsx) lets the fixed callbacks always read current data.
  const latest = useRef({ innerWidth, segWidth, segments, active, onChange });
  latest.current = { innerWidth, segWidth, segments, active, onChange };

  const indexOf = (key: T) => Math.max(0, latest.current.segments.findIndex(s => s.key === key));

  // Snaps the indicator to the active segment whenever it changes from
  // OUTSIDE a drag (a plain tap elsewhere in the app, or the parent
  // switching tabs programmatically) — skipped mid-drag so this doesn't
  // fight updateFromTouch's live-follow. Effects re-run with fresh closures
  // every render regardless, so no staleness risk here.
  useEffect(() => {
    if (draggingRef.current || segWidth === 0) return;
    Animated.spring(indicatorX, { toValue: indexOf(active) * segWidth, useNativeDriver: false, bounciness: 6 }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, segWidth]);

  const updateFromTouch = (touchX: number) => {
    const { innerWidth, segWidth, segments, active } = latest.current;
    if (segWidth === 0) return;
    // touchX is relative to the track's own box, which includes its own
    // padding (PanResponder's handlers are attached to the track View
    // itself) — shift into the padded-out inner coordinate space before
    // centering the indicator under the finger.
    const innerX = touchX - PAD;
    const centered = Math.max(0, Math.min(innerWidth - segWidth, innerX - segWidth / 2));
    indicatorX.setValue(centered);
    const idx = Math.max(0, Math.min(segments.length - 1, Math.round(centered / segWidth)));
    const key = segments[idx].key;
    if (key !== active) {
      Haptics.selectionAsync();
      latest.current.onChange(key);
    }
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: evt => {
        draggingRef.current = true;
        updateFromTouch(evt.nativeEvent.locationX);
      },
      onPanResponderMove: evt => updateFromTouch(evt.nativeEvent.locationX),
      onPanResponderRelease: () => {
        draggingRef.current = false;
        const { segWidth, active } = latest.current;
        Animated.spring(indicatorX, { toValue: indexOf(active) * segWidth, useNativeDriver: false, bounciness: 6 }).start();
      },
      onPanResponderTerminate: () => { draggingRef.current = false; },
    })
  ).current;

  return (
    <View
      style={styles.track}
      onLayout={e => setInnerWidth(e.nativeEvent.layout.width - PAD * 2)}
      {...pan.panHandlers}
    >
      <GlassIconBg borderRadius={17} interactive={false} />
      {segWidth > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            { width: segWidth, transform: [{ translateX: indicatorX }] },
          ]}
        >
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
