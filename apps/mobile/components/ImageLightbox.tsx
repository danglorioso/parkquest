import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated, Dimensions, FlatList, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { GlassIconBg } from '@/components/GlassIconBg';
import Reanimated, {
  useSharedValue, useAnimatedStyle, withTiming,
} from 'react-native-reanimated';

const { width: W, height: H } = Dimensions.get('window');
const FRAME_W = W * 0.9;
const FRAME_H = H * 0.75;
const FRAME_LEFT = W * 0.05;
const FRAME_TOP = (H - FRAME_H) / 2;
const ARROW_FADE_DELAY = 2500;

export interface LightboxImage {
  url: string;
  title?: string | null;
}

// ── Single page — owns its own zoom/pan so pinching one image never affects
// its neighbors, and un-zooms itself the moment it's swiped off-screen ───────

function LightboxPage({
  image, active, onRequestClose, onZoomChange, onTouch, onToggleChrome,
}: {
  image: LightboxImage;
  active: boolean;
  onRequestClose: () => void;
  onZoomChange: (zoomed: boolean) => void;
  onTouch: () => void;
  onToggleChrome: () => void;
}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const [zoomed, setZoomed] = useState(false);
  const naturalSize = useRef<{ w: number; h: number } | null>(null);

  // Swiped away — snap back to a clean 1x for next time this page is visible.
  useEffect(() => {
    if (active) return;
    scale.value = withTiming(1);
    savedScale.value = 1;
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    if (zoomed) { setZoomed(false); onZoomChange(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const imageRect = useCallback(() => {
    const n = naturalSize.current;
    if (!n || !n.w || !n.h) {
      return { left: FRAME_LEFT, top: FRAME_TOP, right: FRAME_LEFT + FRAME_W, bottom: FRAME_TOP + FRAME_H };
    }
    const fit = Math.min(FRAME_W / n.w, FRAME_H / n.h);
    const dispW = n.w * fit;
    const dispH = n.h * fit;
    const left = FRAME_LEFT + (FRAME_W - dispW) / 2;
    const top = FRAME_TOP + (FRAME_H - dispH) / 2;
    return { left, top, right: left + dispW, bottom: top + dispH };
  }, []);

  const handleTapAt = useCallback((x: number, y: number) => {
    const r = imageRect();
    const inside = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    // On the image: toggle the chrome (arrows/close/dots) instead of closing.
    if (inside) { onToggleChrome(); return; }
    if (zoomed) return; // must un-zoom first — a stray tap shouldn't dismiss a zoomed-in view
    onRequestClose();
  }, [zoomed, imageRect, onRequestClose, onToggleChrome]);

  const resetZoom = useCallback(() => {
    scale.value = withTiming(1);
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedScale.value = 1;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    setZoomed(false);
    onZoomChange(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onZoomChange]);

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onUpdate(e => {
      scale.value = Math.min(Math.max(savedScale.value * e.scale, 1), 5);
      onTouch();
    })
    .onEnd(() => {
      if (scale.value <= 1.02) {
        resetZoom();
      } else {
        savedScale.value = scale.value;
        setZoomed(true);
        onZoomChange(true);
      }
    });

  const pan = Gesture.Pan()
    .enabled(zoomed)
    .runOnJS(true)
    .onUpdate(e => {
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
      onTouch();
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  // Swipe up OR down (only while un-zoomed) closes the lightbox — either
  // direction reads as "pull this away", not just down. The image follows
  // the finger so the dismissal reads as a drag, then snaps back if the pull
  // wasn't decisive. activeOffsetY/failOffsetX keep horizontal swipes flowing
  // to the pager FlatList untouched.
  const dismissPan = Gesture.Pan()
    .enabled(!zoomed)
    .activeOffsetY([-20, 20])
    .failOffsetX([-15, 15])
    .runOnJS(true)
    .onUpdate(e => {
      translateY.value = e.translationY;
    })
    .onEnd(e => {
      if (Math.abs(e.translationY) > 120 || Math.abs(e.velocityY) > 800) {
        onRequestClose();
      } else {
        translateY.value = withTiming(0);
      }
    });

  // Double-tap toggles zoom: zoomed in → restore the default 1x view;
  // un-zoomed → zoom to 2.5x keeping the tapped spot under the finger.
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .runOnJS(true)
    .onEnd((e, success) => {
      if (!success) return;
      if (zoomed) {
        resetZoom();
      } else {
        const r = imageRect();
        if (e.x < r.left || e.x > r.right || e.y < r.top || e.y > r.bottom) return;
        const s = 2.5;
        // Scale is center-origin: a point at offset d from center lands at
        // d*s, so translating by -d*(s-1) keeps the tapped point stationary.
        const dx = e.x - W / 2;
        const dy = e.y - (FRAME_TOP + FRAME_H / 2);
        scale.value = withTiming(s);
        translateX.value = withTiming(-dx * (s - 1));
        translateY.value = withTiming(-dy * (s - 1));
        savedScale.value = s;
        savedTranslateX.value = -dx * (s - 1);
        savedTranslateY.value = -dy * (s - 1);
        setZoomed(true);
        onZoomChange(true);
      }
      onTouch();
    });

  const tap = Gesture.Tap()
    .runOnJS(true)
    .maxDuration(250)
    .onEnd((e, success) => {
      if (!success) return;
      handleTapAt(e.x, e.y);
    });

  const composed = Gesture.Simultaneous(pinch, pan, dismissPan, Gesture.Exclusive(doubleTap, tap));

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={composed}>
      <View style={styles.page}>
        <Reanimated.View style={[styles.img, animatedStyle]}>
          <Image
            source={{ uri: image.url }}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            cachePolicy="memory-disk"
            onLoad={e => { naturalSize.current = { w: e.source.width, h: e.source.height }; }}
          />
        </Reanimated.View>
      </View>
    </GestureDetector>
  );
}

// ── Lightbox ──────────────────────────────────────────────────────────────────

// Rendered ONLY by lib/imageLightbox's ImageLightboxHost (mounted once at
// the app root, see _layout.tsx) — never call this directly from a screen.
// Use openImageLightbox() instead. This used to be a self-contained
// component any screen rendered inline via a real RN <Modal>, but multi-
// touch gestures (pinch) don't reliably register inside a Modal on iOS —
// confirmed by two failed attempts to force it to work there (missing
// registration, then a nested GestureHandlerRootView that flashed the
// whole screen black and crashed). Hosting this at the true app root
// instead — same architecture as lib/pinchZoom's PinchZoomHost — sidesteps
// the Modal problem entirely and, as a side effect, also isn't clipped by
// whatever overflow:hidden ancestor the triggering screen happens to have
// (e.g. PostCard's own card wrapper).
export function ImageLightboxView({
  images, initialIndex = 0, onClose, loop = true,
}: {
  images: LightboxImage[];
  initialIndex?: number;
  // Called with whichever image was on screen when the lightbox closed, so a
  // caller with its own carousel (e.g. PostCard) can stay in sync instead of
  // resetting to wherever it was before the lightbox opened.
  onClose: (index: number) => void;
  // Park photos wrap around (there's no natural "last" one); a user's own
  // post/upload strip has a definite end and shouldn't loop back to the start.
  loop?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [idx, setIdx] = useState(initialIndex);
  const [zoomed, setZoomed] = useState(false);
  const listRef = useRef<FlatList<LightboxImage>>(null);
  const n = images.length;
  const wraps = loop && n > 1;
  const idxRef = useRef(idx);
  idxRef.current = idx;
  // Reads the index at call time (not whatever `idx` a stale closure captured),
  // so it reports the last-viewed image regardless of which handler fires.
  const handleClose = useCallback(() => onClose(idxRef.current), [onClose]);

  // For wrap-around swiping, pad the real data with a clone of the last image
  // up front and a clone of the first image at the end. List index `k` maps
  // to real image index `k - 1`. Landing on a clone snaps silently (no
  // animation) to its real counterpart, giving the illusion of an infinite loop.
  // Non-looping galleries use the images array as-is and simply stop at the ends.
  const loopData = wraps ? [images[n - 1], ...images, images[0]] : images;
  const initialListIndex = wraps ? initialIndex + 1 : initialIndex;

  const goTo = (k: number) => {
    if (n <= 1) return;
    if (wraps) {
      const real = ((k % n) + n) % n;
      listRef.current?.scrollToIndex({ index: real + 1, animated: true });
      setIdx(real);
    } else {
      const real = Math.max(0, Math.min(n - 1, k));
      listRef.current?.scrollToIndex({ index: real, animated: true });
      setIdx(real);
    }
  };

  // Arrows and the counter chip fade out after a few seconds of no
  // interaction, and reappear briefly whenever the visible image changes or
  // the user touches anything.
  const chromeOpacity = useRef(new Animated.Value(1)).current;
  const [chromeVisible, setChromeVisible] = useState(true);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showChromeBriefly = useCallback(() => {
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    setChromeVisible(true);
    chromeOpacity.setValue(1);
    fadeTimer.current = setTimeout(() => {
      Animated.timing(chromeOpacity, { toValue: 0, duration: 400, useNativeDriver: true })
        .start(() => setChromeVisible(false));
    }, ARROW_FADE_DELAY);
  }, [chromeOpacity]);

  // Tap-to-hide: chromeVisible flips immediately (the close button unmounts
  // and taps fall through right away) while the rest fades out fast.
  const hideChrome = useCallback(() => {
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    setChromeVisible(false);
    Animated.timing(chromeOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
  }, [chromeOpacity]);

  const chromeVisibleRef = useRef(chromeVisible);
  chromeVisibleRef.current = chromeVisible;
  const toggleChrome = useCallback(() => {
    if (chromeVisibleRef.current) hideChrome();
    else showChromeBriefly();
  }, [hideChrome, showChromeBriefly]);

  useEffect(() => {
    showChromeBriefly();
    return () => { if (fadeTimer.current) clearTimeout(fadeTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  return (
    <View style={[StyleSheet.absoluteFillObject, { zIndex: 300 }]}>
      <View style={styles.bg}>
        {/* Fullscreen pager — swipe anywhere to change image, wraps at the ends.
            Disabled while zoomed in so a pan-to-inspect never also flips pages.
            Chrome wakes on swipes/pinches/pans, but NOT on every touch — a tap
            on the image toggles it, so a blanket onTouchStart would fight the
            hide half of that toggle. */}
        <FlatList
          ref={listRef}
          data={loopData}
          keyExtractor={(_, k) => String(k)}
          horizontal
          pagingEnabled
          scrollEnabled={!zoomed}
          showsHorizontalScrollIndicator={false}
          onScrollBeginDrag={showChromeBriefly}
          style={StyleSheet.absoluteFill}
          initialScrollIndex={initialListIndex}
          getItemLayout={(_, index) => ({ length: W, offset: W * index, index })}
          onMomentumScrollEnd={e => {
            if (n <= 1) return;
            const listIndex = Math.round(e.nativeEvent.contentOffset.x / W);
            if (!wraps) { setIdx(listIndex); return; }
            if (listIndex === 0) {
              listRef.current?.scrollToIndex({ index: n, animated: false });
              setIdx(n - 1);
            } else if (listIndex === n + 1) {
              listRef.current?.scrollToIndex({ index: 1, animated: false });
              setIdx(0);
            } else {
              setIdx(listIndex - 1);
            }
          }}
          renderItem={({ item, index }) => (
            <LightboxPage
              image={item}
              active={wraps ? index === idx + 1 : index === idx}
              onRequestClose={handleClose}
              onZoomChange={setZoomed}
              onTouch={showChromeBriefly}
              onToggleChrome={toggleChrome}
            />
          )}
        />

        {/* Counter chip — top left, fades with the arrows */}
        {n > 1 && (
          <Animated.View
            pointerEvents="none"
            style={[styles.counter, { top: insets.top + 12, opacity: chromeOpacity }]}
          >
            <Text style={styles.counterText}>{idx + 1} / {n}</Text>
          </Animated.View>
        )}

        {/* Close — mounted/unmounted rather than opacity-faded: a GlassView
            living inside an alpha < 1 ancestor renders no glass material. */}
        {chromeVisible && (
          <TouchableOpacity
            style={[styles.close, { top: insets.top + 12 }]}
            onPress={handleClose}
            hitSlop={16}
          >
            <GlassIconBg onMedia fallbackColor="rgba(0,0,0,0.35)" />
            <Ionicons name="close" size={22} color="#FFFBF1" />
          </TouchableOpacity>
        )}

        {/* Prev / next arrows — fade after a few seconds of inactivity */}
        {n > 1 && (!wraps ? idx > 0 : true) && (
          <Animated.View
            pointerEvents={chromeVisible ? 'auto' : 'none'}
            style={[styles.nav, { left: 16, opacity: chromeOpacity }]}
          >
            <TouchableOpacity onPress={() => goTo(idx - 1)} style={styles.navBtn}>
              <Ionicons name="chevron-back" size={28} color="#fff" style={styles.navIconShadow} />
            </TouchableOpacity>
          </Animated.View>
        )}
        {n > 1 && (!wraps ? idx < n - 1 : true) && (
          <Animated.View
            pointerEvents={chromeVisible ? 'auto' : 'none'}
            style={[styles.nav, { right: 16, opacity: chromeOpacity }]}
          >
            <TouchableOpacity onPress={() => goTo(idx + 1)} style={styles.navBtn}>
              <Ionicons name="chevron-forward" size={28} color="#fff" style={styles.navIconShadow} />
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Caption */}
        {images[idx]?.title ? (
          <Animated.View
            style={[styles.caption, { bottom: insets.bottom + 64, opacity: chromeOpacity }]}
            pointerEvents="none"
          >
            <Text style={styles.captionText} numberOfLines={2}>{images[idx].title}</Text>
          </Animated.View>
        ) : null}

        {/* Dot strip */}
        {n > 1 && (
          <Animated.View
            pointerEvents={chromeVisible ? 'auto' : 'none'}
            style={[styles.dots, { bottom: insets.bottom + 28, opacity: chromeOpacity }]}
          >
            {images.map((_, k) => (
              <TouchableOpacity key={k} onPress={() => goTo(k)}>
                <View style={[styles.dot, k === idx ? styles.dotActive : styles.dotInactive]} />
              </TouchableOpacity>
            ))}
          </Animated.View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.93)',
  },
  page: {
    width: W,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  img: {
    width: FRAME_W,
    height: FRAME_H,
  },
  counter: {
    position: 'absolute',
    left: 16,
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 100,
  },
  counterText: {
    color: '#FFFBF1',
    fontSize: 13,
    fontWeight: '700',
  },
  close: {
    position: 'absolute',
    right: 18,
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  nav: {
    position: 'absolute',
    top: '50%',
    marginTop: -22,
  },
  // Bare chevrons, no circle — a text shadow keeps them readable over
  // bright photos instead of a fill.
  navBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navIconShadow: {
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  caption: {
    position: 'absolute',
    left: 24,
    right: 24,
    alignItems: 'center',
  },
  captionText: {
    color: 'rgba(255,251,241,0.85)',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 17,
  },
  dots: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: { height: 7, borderRadius: 4 },
  dotActive: { width: 22, backgroundColor: '#fff' },
  dotInactive: { width: 7, backgroundColor: 'rgba(255,255,255,0.35)' },
});
