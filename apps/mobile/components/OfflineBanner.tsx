import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/lib/palette';
import { relTime } from '@/lib/dates';

export function OfflineBanner({ fetchedAt }: { fetchedAt: string }) {
  const C = useColors();
  return (
    <View style={[styles.wrap, { backgroundColor: C.surfaceAlt, borderColor: C.hairline }]}>
      <Ionicons name="cloud-offline-outline" size={14} color={C.inkMute} />
      <Text style={[styles.text, { color: C.inkMute }]} numberOfLines={1}>
        Offline — showing parks saved {relTime(fetchedAt)}
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
