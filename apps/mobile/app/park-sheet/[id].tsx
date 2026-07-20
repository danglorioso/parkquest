// Map-dot entry point: presents the park profile as a fully CUSTOM sheet —
// NOT a native formSheet (see the long comment on this route's Stack.Screen
// options in app/_layout.tsx for why: two native-sheet designs were tried
// and hit real, confirmed limits — a won't-fix ScrollView bug, then an
// unfixable edge-to-edge ceiling). This screen is just a transparent,
// unanimated container; ParkProfileScreen (gated on inSheet, from
// usePathname) owns 100% of the actual sheet behavior — the translating
// Animated.View, the drag gesture, the half/full/dismiss snap points, all
// of it. Renders the SAME screen component as /park/[id], same as
// p/[id].tsx re-exports the feed post screen — one page, two
// presentations, so any edit to the park profile shows up in both places.
//
// The nested SafeAreaProvider here is mostly redundant now that the
// presentation is a full-screen transparentModal (same bounds as the
// pushed page, so insets.top/bottom should already match the outer one) —
// left in place since it's harmless and untangling it isn't worth the risk
// of a subtle insets regression for no real benefit.
//
// pointerEvents="box-none" is NOT redundant, though: SafeAreaProvider's own
// native view has no pointerEvents override of its own (plain 'auto'), and
// it sits ABOVE (ancestor of) ParkProfileScreen's own carefully box-none'd
// root View. A single plain 'auto' view anywhere in this screen's ancestor
// chain is enough to break the map-through-the-gap pass-through: iOS's
// hitTest stops at the first non-nil result, and a plain view with no
// touch handlers of its own still hitTests as itself (non-nil) rather than
// nil — it just does nothing with the touch, which reads as "the map
// stopped responding" even though nothing here actually wanted the touch.
// This file is only ever mounted for the sheet route (the pushed page
// renders ParkProfileScreen directly via /park/[id], not through here), so
// box-none is safe unconditionally — no inSheet check needed.
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ParkProfileScreen from '../park/[id]';

export default function ParkSheetScreen() {
  return (
    <SafeAreaProvider pointerEvents="box-none">
      <ParkProfileScreen />
    </SafeAreaProvider>
  );
}
