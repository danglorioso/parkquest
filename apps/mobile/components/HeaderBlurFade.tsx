import { Platform, StyleSheet, View } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

// The floating top bar's backdrop for the non-Liquid-Glass branch (feed +
// profile tabs share it so both headers match exactly): blur that fades out
// progressively toward the bar's bottom edge, plus a matching tint fade.
//
// BlurView has no gradient of its own — a plain one ends in a hard
// horizontal line where blurred content abruptly turns sharp, and stacking
// a couple of shorter blurs on top only turned that one line into two
// smaller ones. Instead each blur is drawn through a gradient alpha mask
// (MaskedView), so it dissolves smoothly into the unblurred page: two
// layers, a strong one that's gone by ~70% of the bar's height and a soft
// full-height one, approximate the blur radius itself tapering off rather
// than a single blur merely crossfading out.

interface Props {
  isDark: boolean;
}

function FadedBlur({ intensity, tint, locations }: {
  intensity: number;
  tint: 'systemUltraThinMaterialDark' | 'systemUltraThinMaterialLight';
  locations: [number, number, number];
}) {
  return (
    <MaskedView
      style={StyleSheet.absoluteFill}
      maskElement={
        <LinearGradient
          colors={['#000', '#000', 'rgba(0,0,0,0)']}
          locations={locations}
          style={StyleSheet.absoluteFill}
        />
      }
    >
      <BlurView intensity={intensity} tint={tint} style={StyleSheet.absoluteFill} />
    </MaskedView>
  );
}

export function HeaderBlurFade({ isDark }: Props) {
  const tint = isDark ? 'systemUltraThinMaterialDark' : 'systemUltraThinMaterialLight';
  const rgb = isDark ? '23,21,17' : '242,235,219';
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Platform.OS === 'ios' && (
        <>
          <FadedBlur intensity={40} tint={tint} locations={[0, 0.45, 1]} />
          <FadedBlur intensity={70} tint={tint} locations={[0, 0.25, 0.7]} />
        </>
      )}
      {/* Fades the tint color to fully transparent by the bar's own bottom
          edge — same height, no hard cutoff */}
      <LinearGradient
        colors={[`rgba(${rgb},0.72)`, `rgba(${rgb},0.4)`, `rgba(${rgb},0)`]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
