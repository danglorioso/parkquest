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
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name="star" size={size * 0.58} color={C.onPrimary} />
    </View>
  );
}
