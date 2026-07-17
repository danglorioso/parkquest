import { StyleSheet, View } from 'react-native';
import { GlassView, liquidGlassAvailable } from '@/lib/glass';
import { dyn } from '@/lib/palette';

const glass = liquidGlassAvailable && GlassView != null;

// Frosted background for circular header icon buttons (bell, search, gear, back,
// share, …) — real Liquid Glass where available, a flat translucent fill
// otherwise (Expo Go / older iOS / Android). Render as the first child of a
// TouchableOpacity that has `overflow: 'hidden'` and no backgroundColor of its own.
// Pass `tintColor` for a prominent/tinted glass button (e.g. a primary CTA) —
// falls back to a flat fill in that color when Liquid Glass is unavailable.
//
// `onMedia` selects Apple's "clear" glass style instead of "regular" — this
// is the actual HIG-documented difference, not a visual tweak: "regular" is
// a frosted/opaque material meant for plain surfaces, and always renders
// whitish/gray regardless of what's behind it (that's by design, not a
// fallback-mode bug). "clear" is the variant meant to sit over photos/video —
// it lets much more of the underlying color and detail show through instead
// of being hazed over. Pass true for any button floating over a photo (park
// page hero, lightbox); leave false over plain surfaces (settings back
// button, the frozen title bar's own surface).
export function GlassIconBg({
  interactive = true, tintColor, fallbackColor, onMedia = false, borderRadius = 999,
}: { interactive?: boolean; tintColor?: string; fallbackColor?: string; onMedia?: boolean; borderRadius?: number }) {
  // Real Liquid Glass's own press/highlight layer doesn't reliably respect
  // the parent TouchableOpacity's overflow:hidden clip — on a hold it was
  // showing a square edge escaping past the circular button (park page
  // header buttons, settings back button), and on real devices the glass
  // material's own shape wins over the ancestor's clip entirely rather than
  // just leaking a highlight past it, which is why a wide pill button
  // (Log another visit) rendered fully oval despite its container's own
  // borderRadius: 12 — the glass fill ignored that and used its default.
  // So the glass view's OWN borderRadius has to match the button's actual
  // shape: default 999 (RN clamps to min(w,h)/2, i.e. a true circle) for
  // the small round icon buttons every other caller uses this for, but
  // callers with a non-circular shape (wide pill buttons) must pass their
  // real radius explicitly.
  return glass && GlassView
    ? <GlassView style={[StyleSheet.absoluteFill, { borderRadius, overflow: 'hidden' }]} glassEffectStyle={onMedia ? 'clear' : 'regular'} tintColor={tintColor} isInteractive={interactive} />
    : <View style={[StyleSheet.absoluteFill, styles.fallback, (fallbackColor ?? tintColor) ? { backgroundColor: fallbackColor ?? tintColor } : null]} />;
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: dyn('rgba(255,251,241,0.55)', 'rgba(32,29,23,0.55)'),
  },
});
