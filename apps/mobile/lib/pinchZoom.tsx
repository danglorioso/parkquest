import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import Reanimated, { useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';

// Instagram-style inline pinch-zoom for feed photos (PostCard's PhotoCarousel,
// via PinchZoomPhoto) — mounted ONCE at the app root (see _layout.tsx, same
// spot as ToastHost) so its absolute-fill backdrop/clone paint above every
// FlatList item regardless of which post is being touched. A real RN Modal
// would create a new native window mid-touch, which risks the OS handing the
// in-progress multi-touch sequence off oddly; this is a plain sibling view in
// the SAME hierarchy, so the touch that started on the (now-hidden) inline
// image keeps reporting to it untouched — this host only ever mirrors shared
// values, it never itself receives touches (pointerEvents="none" throughout).
//
// Only one photo can ever be pinched at a time (it takes two fingers on one
// image), so every PinchZoomPhoto instance shares this single set of shared
// values rather than each owning its own — set once the host mounts.

export interface PinchZoomRect { x: number; y: number; width: number; height: number }

interface PinchZoomStore {
  scale: SharedValue<number>;
  translateX: SharedValue<number>;
  translateY: SharedValue<number>;
  backdropOpacity: SharedValue<number>;
  setFrame: (rect: PinchZoomRect | null, uri: string | null, fallbackColor: string) => void;
}

let store: PinchZoomStore | null = null;

// Returns null if called before the host has mounted (or after it unmounts) —
// callers no-op in that case rather than crash; in practice a pinch can only
// happen well after RootLayout has mounted this alongside the navigator.
export function getPinchZoomStore(): PinchZoomStore | null {
  return store;
}

export function PinchZoomHost() {
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const backdropOpacity = useSharedValue(0);
  const [rect, setRect] = useState<PinchZoomRect | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [fallbackColor, setFallbackColor] = useState('#000');

  useEffect(() => {
    store = {
      scale, translateX, translateY, backdropOpacity,
      setFrame: (r, u, fc) => { setRect(r); setUri(u); setFallbackColor(fc); },
    };
    return () => { store = null; };
  }, [scale, translateX, translateY, backdropOpacity]);

  const imageStyle = useAnimatedStyle(() => {
    if (!rect) return { opacity: 0 };
    return {
      position: 'absolute',
      left: rect.x, top: rect.y, width: rect.width, height: rect.height,
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value },
      ],
    };
  });

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));

  if (!rect) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Reanimated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} />
      <Reanimated.View style={imageStyle}>
        {uri ? (
          <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: fallbackColor }]} />
        )}
      </Reanimated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: '#000' },
});
