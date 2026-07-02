import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Matches web `VisibilityChip` component in journal/detail pages.
// visibility: 'public' | 'friends' | 'private' — null/undefined = private fallback.

export interface VisChipProps {
  visibility?: string | null;
}

const C = {
  surfaceAlt: '#F7F0DE',
  inkMute:    '#7A746A',
  hairline:   'rgba(27,26,22,0.10)',
};

type VisConfig = { icon: keyof typeof Ionicons.glyphMap; label: string };

const VIS: Record<string, VisConfig> = {
  public:  { icon: 'globe-outline',  label: 'PUBLIC'  },
  friends: { icon: 'people-outline', label: 'FRIENDS' },
  private: { icon: 'lock-closed-outline', label: 'PRIVATE' },
};

export function VisChip({ visibility }: VisChipProps) {
  const cfg = VIS[visibility ?? 'private'] ?? VIS.private;
  return (
    <View style={s.chip}>
      <Ionicons name={cfg.icon} size={10} color={C.inkMute} />
      <Text style={s.label}>{cfg.label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: C.surfaceAlt, borderRadius: 100,
    paddingHorizontal: 9, paddingVertical: 4,
    borderWidth: 0.5, borderColor: C.hairline,
  },
  label: {
    fontSize: 13, fontWeight: '700', color: C.inkMute,
    letterSpacing: 0.8, fontVariant: ['tabular-nums'],
  },
});
