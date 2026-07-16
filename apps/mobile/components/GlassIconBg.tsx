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
export function GlassIconBg({
  interactive = true, tintColor, fallbackColor,
}: { interactive?: boolean; tintColor?: string; fallbackColor?: string }) {
  // Real Liquid Glass's own press/highlight layer doesn't reliably respect
  // the parent TouchableOpacity's overflow:hidden clip — on a hold it was
  // showing a square edge escaping past the circular button (park page
  // header buttons, settings back button). Setting the glass view's own
  // borderRadius rounds its material (RN clamps to min(w,h)/2, so this is a
  // true circle/pill regardless of the button's actual size) rather than
  // relying entirely on an ancestor's clip.
  return glass && GlassView
    ? <GlassView style={[StyleSheet.absoluteFill, styles.glass]} glassEffectStyle="regular" tintColor={tintColor} isInteractive={interactive} />
    : <View style={[StyleSheet.absoluteFill, styles.fallback, (fallbackColor ?? tintColor) ? { backgroundColor: fallbackColor ?? tintColor } : null]} />;
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: dyn('rgba(255,251,241,0.55)', 'rgba(32,29,23,0.55)'),
  },
  glass: {
    borderRadius: 999,
    overflow: 'hidden',
  },
});
