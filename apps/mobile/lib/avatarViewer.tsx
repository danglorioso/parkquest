import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
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
}

let openFn: ((req: AvatarViewerRequest) => void) | null = null;

function open(req: AvatarViewerRequest) {
  openFn?.(req);
}

// ── Lift state ───────────────────────────────────────────────────────────────
// Which avatar the viewer currently has off the page, and whether its ring is
// back yet. A module-level store read through useAvatarLift, NOT state on
// whoever triggered the viewer: on the profile tab that's the whole
// ProfileScreen, and re-rendering it to flip one opacity took long enough
// that the ring showed up a visible beat after the photo had already landed.
// Keyed by uri, so the view that DRAWS the avatar hides itself no matter
// which tap target opened the viewer (the closed card's floating target and
// the real avatar inside PassportFace are different components, same uri).

type Lift = { uri: string; ringBack: boolean } | null;
let lift: Lift = null;
const liftListeners = new Set<() => void>();

function setLift(next: Lift) {
  lift = next;
  liftListeners.forEach(l => l());
}
function subscribeLift(l: () => void) {
  liftListeners.add(l);
  return () => { liftListeners.delete(l); };
}
function getLift() { return lift; }

/** For the component that draws a tappable avatar — call it as close to the
    avatar's own views as possible, since this is what re-renders when the
    viewer opens and closes. `photoHidden`: the photo is up in the viewer,
    hide the page's copy. `ringHidden`: hide the ring/border/shadow too. The
    two differ only on the way back — the ring returns the moment closing
    starts, so the photo flies home into its frame rather than the frame
    popping in after it lands. */
export function useAvatarLift(uri: string | null | undefined) {
  const state = useSyncExternalStore(subscribeLift, getLift);
  const mine = !!uri && state !== null && state.uri === uri;
  return { photoHidden: mine, ringHidden: mine && !state.ringBack };
}

// Clerk gives every account with no photo of its own a generated placeholder:
// https://img.clerk.com/<base64 JSON> where the JSON opens {"type":"default",…
// (a real photo is {"type":"proxy",…} or an images.clerk.dev/uploaded/… URL).
// This is that opening, base64'd.
const CLERK_DEFAULT_AVATAR = /^https:\/\/img\.clerk\.com\/eyJ0eXBlIjoiZGVmYXVsdCI/;

/** False for no avatar and for Clerk's placeholder — nothing worth a fullscreen look. */
export function canExpandAvatar(uri: string | null | undefined): uri is string {
  return !!uri && !CLERK_DEFAULT_AVATAR.test(uri);
}

/** The tap side of a tappable avatar. Attach `ref` to a plain View
    (collapsable={false}, required for a reliable measureInWindow) wrapping
    EXACTLY the avatar's image — no ring, border or margin inside it. The
    fullscreen circle starts as that measured square, so anything extra in
    there shows up as the photo jumping or changing shape on the first frame.
    Use `onPress` as the avatar's tap handler and gate the touchable on
    `canExpand` (see canExpandAvatar). Holds no state of its own — hiding the
    page's copy while the viewer is up is useAvatarLift's job. */
export function useAvatarExpandViewer({ uri }: { uri: string | null | undefined }) {
  const ref = useRef<View>(null);
  const canExpand = canExpandAvatar(uri);

  // Not every avatar on screen is drawn by expo-image (PassportFace's is RN's
  // own Image, a separate cache) — warm the one the viewer reads from so its
  // copy is ready the moment it's tapped.
  useEffect(() => {
    if (canExpandAvatar(uri)) Image.prefetch(uri, 'memory-disk').catch(() => {});
  }, [uri]);

  const onPress = useCallback(() => {
    if (!canExpandAvatar(uri)) return;
    ref.current?.measureInWindow((x, y, width, height) => {
      open({ uri, sourceRect: { x, y, width, height } });
    });
  }, [uri]);

  return { ref, onPress, canExpand };
}

export function AvatarViewerHost() {
  const [request, setRequest] = useState<AvatarViewerRequest | null>(null);

  useEffect(() => {
    openFn = setRequest;
    return () => { openFn = null; };
  }, []);

  const dismiss = useCallback(() => setRequest(null), []);

  if (!request) return null;
  return <AvatarViewer request={request} onDismissed={dismiss} />;
}

// Its own component, mounted only while a request is up, so the animated
// styles are first evaluated with a real sourceRect. Reanimated keeps a
// style's first-ever result as the view's first-render style and only ever
// pushes the keys a later result contains. Evaluated up in the always-mounted
// host that first result was a no-request `{ opacity: 0 }` placeholder, which
// the real geometry never overwrote — an invisible circle on a black backdrop.
function AvatarViewer({ request, onDismissed }: { request: AvatarViewerRequest; onDismissed: () => void }) {
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();
  const progress = useSharedValue(0);
  const { uri, sourceRect: s } = request;

  // Held until the clone actually has the photo on screen: it mounts exactly
  // over the source avatar, and only once it's drawn does the source hide and
  // the grow begin — otherwise the avatar blinks out a frame or more before
  // its copy appears. The timer covers an image that's slow or fails.
  const started = useRef(false);
  const start = useCallback(() => {
    if (started.current) return;
    started.current = true;
    setLift({ uri, ringBack: false });
    progress.value = withTiming(1, { duration: 320 });
  }, [uri, progress]);

  useEffect(() => {
    const t = setTimeout(start, 400);
    return () => clearTimeout(t);
  }, [start]);

  // Whatever way this goes away, never leave an avatar hidden behind it
  useEffect(() => () => setLift(null), []);

  // Photo back on the page first, clone gone a frame later — the other way
  // round there's a frame with the ring and nothing in it.
  const finish = useCallback(() => {
    setLift(null);
    requestAnimationFrame(onDismissed);
  }, [onDismissed]);

  const close = useCallback(() => {
    // Ring back now, at the START of the trip home (see useAvatarLift). Only
    // if the page's copy was ever hidden — a close before `start` has nothing
    // to restore.
    if (started.current) setLift({ uri, ringBack: true });
    started.current = true;
    progress.value = withTiming(0, { duration: 240 }, finished => {
      if (finished) runOnJS(finish)();
    });
  }, [uri, finish, progress]);

  // The circle is laid out ONCE at its final size and position; only its
  // transform animates. Start pose = that same circle shrunk to the source's
  // diameter and slid onto the source's center. A uniform scale keeps it a
  // true circle the whole way (animating width/height/left/top instead let
  // the two axes interpolate separately, so it visibly changed shape en
  // route) and it's the one photo throughout, never re-laid-out mid-flight.
  const size = Math.min(SCREEN_W, SCREEN_H) * 0.82;
  const fromScale = Math.min(s.width, s.height) / size;
  const fromX = s.x + s.width / 2 - SCREEN_W / 2;
  const fromY = s.y + s.height / 2 - SCREEN_H / 2;

  const circleStyle = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      transform: [
        { translateX: fromX * (1 - p) },
        { translateY: fromY * (1 - p) },
        { scale: fromScale + (1 - fromScale) * p },
      ],
    };
  });

  // Backdrop and close button share this, so the X leaves with the backdrop
  // instead of sitting there at full strength until the unmount lands.
  const fadeStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  return (
    // Keeps swallowing touches until it unmounts: the page mustn't scroll
    // out from under the photo while it's flying back to where it came from.
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Pressable style={StyleSheet.absoluteFill} onPress={close}>
        <Reanimated.View style={[StyleSheet.absoluteFill, styles.backdrop, fadeStyle]} />
      </Pressable>
      <Reanimated.View
        style={[
          styles.circle,
          { left: (SCREEN_W - size) / 2, top: (SCREEN_H - size) / 2, width: size, height: size, borderRadius: size / 2 },
          circleStyle,
        ]}
        pointerEvents="none"
      >
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          onDisplay={start}
          onError={start}
        />
      </Reanimated.View>
      <Reanimated.View style={[styles.closeBtn, fadeStyle]}>
        <Pressable onPress={close} style={styles.closeHit} hitSlop={8}>
          <Ionicons name="close" size={20} color="#fff" />
        </Pressable>
      </Reanimated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: '#000' },
  circle: { position: 'absolute', overflow: 'hidden' },
  closeBtn: {
    position: 'absolute', top: 56, right: 20, width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  closeHit: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
