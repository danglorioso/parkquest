import { StyleSheet, Text, View, useColorScheme, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/lib/palette';
import { relTime } from '@/lib/dates';

export function OfflineBanner({
  fetchedAt, noun = 'parks', style, solid = false,
}: { fetchedAt: string; noun?: string; style?: ViewStyle; solid?: boolean }) {
  const C = useColors();
  // C.bucket is a fixed ColorValue (STATIC's dyn() pair), not a plain
  // string like the theme-reactive primary/accent fields — can't suffix an
  // alpha value onto it directly, so the known hex pair is used here instead.
  const isDark = useColorScheme() === 'dark';
  const bucketHex = isDark ? '#D9A63E' : '#C48A20';
  // relTime's bare "2h"/"3d" style is right for feed timestamps (PostCard,
  // profile/edit) but reads as a fragment here — append "ago" for the
  // relative-unit cases only, not "just now" or the absolute-date fallback.
  const rel = relTime(fetchedAt);
  const relText = /^\d+[mhd]$/.test(rel) ? `${rel} ago` : rel;
  // `solid` (map tab) — bucketHex-colored TEXT on a bucketHex-TINTED
  // background is a same-hue combo no matter the alpha (tried 93%: too
  // dark/heavy; tried 60%: muddy, low contrast) — bucketHex itself is a
  // medium-dark gold, there's no opaque amount of it that reads as light.
  // Fixed pastel gold instead, with dark ink text for guaranteed contrast.
  const bg = solid ? '#ECDFC4' : bucketHex + '1F';
  const border = solid ? bucketHex : bucketHex + '55';
  const fg = solid ? '#1B1A16' : C.bucket;
  return (
    <View style={[styles.wrap, { backgroundColor: bg, borderColor: border }, style]}>
      <Ionicons name="cloud-offline-outline" size={14} color={fg} />
      <Text style={[styles.text, { color: fg }]} numberOfLines={1}>
        Offline — showing {noun} saved {relText}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 0.5,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  text: {
    fontSize: 12.5,
    fontWeight: '500',
    flexShrink: 1,
  },
});
