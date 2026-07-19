import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/lib/palette';

// Verified-style badge shown beside admins' names — filled star in a
// primary-colored circle. Driven by is_admin/author_is_admin from the API
// (a display mirror of the Clerk admin role).
export function AdminStar({ size = 14 }: { size?: number }) {
  const C = useColors();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: C.primary,
      }}
    >
      {/* The star is a font glyph — its baseline/line-box metrics nudge it
          off-center under flexbox centering. Absolute-fill + textAlign +
          lineHeight pins the glyph dead-center in the circle instead. */}
      <Ionicons
        name="star"
        size={size * 0.58}
        color={C.onPrimary}
        style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          textAlign: 'center',
          lineHeight: size,
        }}
      />
    </View>
  );
}
