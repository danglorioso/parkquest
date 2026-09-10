import { useRef, useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

// One PhotoCarousel cell (PostCard) — a tappable photo that opens the
// fullscreen lightbox, which has its own working pinch-to-zoom/pan
// (ImageLightbox.tsx, built on the standard Gesture.Pinch()/Gesture.Pan()
// APIs). This used to also support an Instagram-style in-place pinch-zoom
// (a Gesture.Manual() raw-touch state machine mirrored into an app-root
// PinchZoomHost overlay) — removed after it reliably soft-locked the
// screen: the zoomed overlay renders with pointerEvents="none" (by design,
// it only ever mirrors shared values, never receives touches) and
// dismissal depended entirely on that gesture's own onTouchesUp/
// onTouchesCancelled correctly firing on every device; whenever that
// lifecycle didn't complete (state details never fully root-caused — the
// feature had no device testing behind it before shipping), the backdrop
// was left permanently opaque with no tap-to-dismiss fallback anywhere,
// i.e. a black, un-recoverable screen. Not worth re-attempting without a
// way to test the gesture lifecycle on a real device first — the
// fullscreen lightbox already covers pinch-to-zoom safely.
//
// A plain TouchableOpacity's onPress fired even for a two-finger pinch here
// (it only tracks its own touch's press-in/out, not how many fingers landed
// on it) — a pinch meant to zoom the ambient carousel photo would open the
// fullscreen lightbox out from under it.
export function PinchZoomPhoto({
  uri, size, fallbackColor, onPress,
}: {
  uri: string | null;
  size: number;
  fallbackColor: string;
  onPress: () => void;
}) {
  const [pressed, setPressed] = useState(false);
  // Set the instant a second finger lands, gating onEnd below. NOT done via
  // GestureStateManager.fail() inside onTouchesDown (tried first) — that
  // API is meant for Gesture.Manual(), where the gesture has no native
  // recognizer of its own to contend with; calling it on a plain
  // Gesture.Tap() crashed on the second finger, almost certainly a race
  // between this forced JS-thread fail (.runOnJS(true), below) and the Tap
  // handler's own native state transition. A plain ref sidesteps gesture
  // state entirely — the native recognizer runs however it likes, this
  // just decides whether onEnd's own success is honored.
  const multiTouchRef = useRef(false);

  // Every callback below (onTouchesDown, onBegin, onFinalize, onEnd) runs
  // as a UI-thread worklet by default once reanimated is installed —
  // calling setPressed or the onPress prop directly from there (both plain
  // JS-thread functions) throws/crashes without this. Simplest fix: run
  // the whole gesture on the JS thread, same convention the old
  // Gesture.Manual() version used (.runOnJS(true) there too) — nothing
  // here needs UI-thread timing anyway.
  const tap = Gesture.Tap()
    .runOnJS(true)
    .onTouchesDown(e => {
      if (e.allTouches.length > 1) multiTouchRef.current = true;
    })
    .onBegin(() => {
      multiTouchRef.current = false;
      setPressed(true);
    })
    .onFinalize(() => setPressed(false))
    .onEnd((_e, success) => {
      if (success && !multiTouchRef.current) onPress();
    });

  return (
    <GestureDetector gesture={tap}>
      <View style={{ width: size, height: size, opacity: pressed ? 0.92 : 1 }}>
        {uri ? (
          <Image source={{ uri }} style={{ width: size, height: size }} contentFit="cover" cachePolicy="memory-disk" />
        ) : (
          <View style={{ width: size, height: size, backgroundColor: fallbackColor }} />
        )}
      </View>
    </GestureDetector>
  );
}
