import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { useAnimatedStyle, useSharedValue, withTiming, runOnJS } from 'react-native-reanimated';

// Tap-to-expand fullscreen circular avatar viewer, replacing the old plain
// fade-in AvatarLightbox. The circle grows from exactly where it was tapped
// (measured via measureInWindow — same technique as PinchZoomPhoto/
// lib/pinchZoom.tsx for feed photos) into a large centered circle. Mounted
// ONCE at the app root (see _layout.tsx, same spot as PinchZoomHost/
// ImageLightboxHost) rather than as a real RN <Modal> — a Modal can't show
// the screen behind it mid-transition, which this grow animation needs, and
// (per ImageLightbox's own note) doesn't reliably host gestures either.

export interface AvatarViewerRect { x: number; y: number; width: number; height: number }

interface AvatarViewerRequest {
  uri: string;
  sourceRect: AvatarViewerRect;
  onClosed: () => void;
}

let openFn: ((req: AvatarViewerRequest) => void) | null = null;

function open(req: AvatarViewerRequest) {
  openFn?.(req);
}

/** Wraps a tappable avatar. Attach `ref` to a plain wrapping View
    (collapsable={false}, required for a reliable measureInWindow) around
    whatever renders the avatar's own pixels, apply `hidden` to that same
    view's opacity, and use `onPress` in place of the avatar's own
    TouchableOpacity handler. Hiding the source while the clone is up isn't
    redundant with the clone simply painting on top of it — the circle
    interpolates position and size independently between source and target,
    so a mid-animation frame isn't guaranteed to fully cover the source's
    exact footprint the whole way through. */
export function useAvatarExpandViewer({ uri }: { uri: string | null | undefined }) {
  const ref = useRef<View>(null);
  const [hidden, setHidden] = useState(false);

  const onPress = useCallback(() => {
    if (!uri) return;
    ref.current?.measureInWindow((x, y, width, height) => {
      setHidden(true);
      open({
        uri,
        sourceRect: { x, y, width, height },
        onClosed: () => setHidden(false),
      });
    });
  }, [uri]);

  return { ref, hidden, onPress };
}

export function AvatarViewerHost() {
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();
  const [request, setRequest] = useState<AvatarViewerRequest | null>(null);
  const progress = useSharedValue(0);

  useEffect(() => {
    openFn = req => {
      setRequest(req);
      progress.value = 0;
      progress.value = withTiming(1, { duration: 320 });
    };
    return () => { openFn = null; };
  }, [progress]);

  const close = useCallback(() => {
    if (!request) return;
    const req = request;
    progress.value = withTiming(0, { duration: 240 }, finished => {
      if (finished) {
        runOnJS(req.onClosed)();
        runOnJS(setRequest)(null);
      }
    });
  }, [request, progress]);

  const size = Math.min(SCREEN_W, SCREEN_H) * 0.82;
  const targetX = (SCREEN_W - size) / 2;
  const targetY = (SCREEN_H - size) / 2;

  const circleStyle = useAnimatedStyle(() => {
    if (!request) return { opacity: 0 };
    const s = request.sourceRect;
    const p = progress.value;
    const w = s.width + (size - s.width) * p;
    const h = s.height + (size - s.height) * p;
    return {
      position: 'absolute',
      left: s.x + (targetX - s.x) * p,
      top: s.y + (targetY - s.y) * p,
      width: w,
      height: h,
      borderRadius: w / 2,
    };
  });

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  if (!request) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Pressable style={StyleSheet.absoluteFill} onPress={close}>
        <Reanimated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} />
      </Pressable>
      <Reanimated.View style={[circleStyle, styles.circle]} pointerEvents="none">
        <Image source={{ uri: request.uri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
      </Reanimated.View>
      <Pressable onPress={close} style={styles.closeBtn} hitSlop={8}>
        <Ionicons name="close" size={20} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: '#000' },
  circle: { overflow: 'hidden' },
  closeBtn: {
    position: 'absolute', top: 56, right: 20, width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
  },
});
