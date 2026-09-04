import { useCallback, useRef, useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector, type GestureTouchEvent } from 'react-native-gesture-handler';
import { withTiming } from 'react-native-reanimated';
import { getPinchZoomStore } from '@/lib/pinchZoom';

const MAX_SCALE = 4;

// Wraps one PhotoCarousel cell with Instagram-style pinch-to-zoom: a plain tap
// still opens the fullscreen lightbox (unchanged), but a two-finger pinch
// grows the photo in place over a dimmed screen, driven by the shared values
// in lib/pinchZoom's PinchZoomHost. Built on Gesture.Manual + raw touches
// (rather than composing Pinch+Pan) so that dropping from two fingers to one
// mid-gesture keeps panning smoothly instead of ending — activate() is only
// called once a second finger actually lands, so an ordinary one-finger swipe
// (paging the carousel) never engages this at all and reaches the ScrollView
// untouched. Releasing every finger (0 touches) is the only thing that resets.
export function PinchZoomPhoto({
  uri, size, fallbackColor, onPress, onZoomChange,
}: {
  uri: string | null;
  size: number;
  fallbackColor: string;
  onPress: () => void;
  onZoomChange?: (zooming: boolean) => void;
}) {
  const viewRef = useRef<View>(null);
  const [hidden, setHidden] = useState(false);
  const zoomingRef = useRef(false);
  // Plain ref, not a shared value — every callback here runs on the JS thread
  // (.runOnJS(true) below), same convention ImageLightbox already uses for
  // its own pinch/pan.
  const base = useRef({ scale: 1, x: 0, y: 0, distance: 0, cx: 0, cy: 0 });

  const rebase = useCallback((touches: GestureTouchEvent['allTouches']) => {
    const store = getPinchZoomStore();
    if (!store) return;
    base.current.scale = store.scale.value;
    base.current.x = store.translateX.value;
    base.current.y = store.translateY.value;
    if (touches.length >= 2) {
      const dx = touches[1].absoluteX - touches[0].absoluteX;
      const dy = touches[1].absoluteY - touches[0].absoluteY;
      base.current.distance = Math.sqrt(dx * dx + dy * dy);
      base.current.cx = (touches[0].absoluteX + touches[1].absoluteX) / 2;
      base.current.cy = (touches[0].absoluteY + touches[1].absoluteY) / 2;
    } else if (touches.length === 1) {
      base.current.distance = 0;
      base.current.cx = touches[0].absoluteX;
      base.current.cy = touches[0].absoluteY;
    }
  }, []);

  const beginZoom = useCallback(() => {
    viewRef.current?.measureInWindow((x, y, width, height) => {
      const store = getPinchZoomStore();
      if (!store) return;
      store.setFrame({ x, y, width, height }, uri, fallbackColor);
      store.scale.value = 1;
      store.translateX.value = 0;
      store.translateY.value = 0;
      store.backdropOpacity.value = withTiming(1, { duration: 150 });
    });
    setHidden(true);
    onZoomChange?.(true);
  }, [uri, fallbackColor, onZoomChange]);

  const endZoom = useCallback(() => {
    setHidden(false);
    onZoomChange?.(false);
    const store = getPinchZoomStore();
    if (!store) return;
    store.scale.value = withTiming(1, { duration: 220 });
    store.translateX.value = withTiming(0, { duration: 220 });
    store.translateY.value = withTiming(0, { duration: 220 });
    store.backdropOpacity.value = withTiming(0, { duration: 220 }, finished => {
      if (finished) store.setFrame(null, null, fallbackColor);
    });
  }, [fallbackColor]);

  const manual = Gesture.Manual()
    .runOnJS(true)
    .onTouchesDown((e, manager) => {
      if (e.allTouches.length >= 2 && !zoomingRef.current) {
        zoomingRef.current = true;
        manager.activate();
        rebase(e.allTouches);
        beginZoom();
      } else if (zoomingRef.current) {
        rebase(e.allTouches);
      }
    })
    .onTouchesMove(e => {
      if (!zoomingRef.current) return;
      const store = getPinchZoomStore();
      if (!store) return;
      const touches = e.allTouches;
      if (touches.length >= 2) {
        const dx = touches[1].absoluteX - touches[0].absoluteX;
        const dy = touches[1].absoluteY - touches[0].absoluteY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const s = base.current.distance > 0 ? (dist / base.current.distance) * base.current.scale : base.current.scale;
        store.scale.value = Math.min(Math.max(s, 1), MAX_SCALE);
        const cx = (touches[0].absoluteX + touches[1].absoluteX) / 2;
        const cy = (touches[0].absoluteY + touches[1].absoluteY) / 2;
        store.translateX.value = base.current.x + (cx - base.current.cx);
        store.translateY.value = base.current.y + (cy - base.current.cy);
      } else if (touches.length === 1) {
        store.translateX.value = base.current.x + (touches[0].absoluteX - base.current.cx);
        store.translateY.value = base.current.y + (touches[0].absoluteY - base.current.cy);
      }
    })
    .onTouchesUp((e, manager) => {
      if (!zoomingRef.current) {
        if (e.allTouches.length === 0) manager.fail();
        return;
      }
      if (e.allTouches.length === 0) {
        zoomingRef.current = false;
        endZoom();
        manager.end();
      } else {
        rebase(e.allTouches);
      }
    })
    .onTouchesCancelled((_e, manager) => {
      if (zoomingRef.current) {
        zoomingRef.current = false;
        endZoom();
      }
      manager.fail();
    });

  return (
    <GestureDetector gesture={manual}>
      <View ref={viewRef} collapsable={false} style={{ width: size, height: size, opacity: hidden ? 0 : 1 }}>
        <TouchableOpacity activeOpacity={0.92} onPress={onPress} disabled={hidden} style={{ width: size, height: size }}>
          {uri ? (
            <Image source={{ uri }} style={{ width: size, height: size }} contentFit="cover" cachePolicy="memory-disk" />
          ) : (
            <View style={{ width: size, height: size, backgroundColor: fallbackColor }} />
          )}
        </TouchableOpacity>
      </View>
    </GestureDetector>
  );
}
