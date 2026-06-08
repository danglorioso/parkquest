import { Image } from 'expo-image';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';

// Matches web PostCard.tsx `Avatar` and friends/page.tsx `Avatar` exactly.
// Props intentionally identical to both web variants (url/name/size).

export interface AvatarProps {
  url?:   string | null;
  name?:  string | null;
  size?:  number;
  style?: ViewStyle;
}

export function Avatar({ url, name, size = 40, style }: AvatarProps) {
  const r = size / 2;
  const initials = (name ?? '?')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <View style={[{ width: size, height: size, borderRadius: r, overflow: 'hidden', flexShrink: 0 }, style]}>
      {url ? (
        <Image
          source={{ uri: url }}
          style={{ width: size, height: size }}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={[st.fallback, { borderRadius: r }]}>
          <Text style={[st.initials, { fontSize: size * 0.33 }]}>{initials}</Text>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  fallback: {
    flex: 1, backgroundColor: '#1F3D2E',
    alignItems: 'center', justifyContent: 'center',
  },
  initials: { fontWeight: '800', color: '#FFFBF1', letterSpacing: 0.5 },
});
