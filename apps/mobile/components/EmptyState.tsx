import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface EmptyStateProps {
  icon?:     keyof typeof Ionicons.glyphMap;
  title:     string;
  subtitle?: string;
  action?:   { label: string; onPress: () => void };
}

const C = {
  bg:         '#F2EBDB',
  surface:    '#FFFBF1',
  ink:        '#1B1A16',
  inkMute:    '#7A746A',
  hairline:   'rgba(27,26,22,0.10)',
  primary:    '#1F3D2E',
};

export function EmptyState({ icon, title, subtitle, action }: EmptyStateProps) {
  return (
    <View style={s.wrap}>
      {icon && (
        <View style={s.iconBox}>
          <Ionicons name={icon} size={28} color={C.inkMute} />
        </View>
      )}
      <Text style={s.title}>{title}</Text>
      {subtitle ? <Text style={s.sub}>{subtitle}</Text> : null}
      {action && (
        <TouchableOpacity style={s.btn} onPress={action.onPress} activeOpacity={0.8}>
          <Text style={s.btnText}>{action.label}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap:    { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  iconBox: {
    width: 64, height: 64, borderRadius: 16,
    backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.hairline,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  title:   { fontSize: 16, fontWeight: '700', color: C.ink, textAlign: 'center' },
  sub:     { fontSize: 13, color: C.inkMute, textAlign: 'center', lineHeight: 18 },
  btn: {
    marginTop: 6, backgroundColor: C.primary,
    borderRadius: 100, paddingHorizontal: 20, paddingVertical: 10,
  },
  btnText: { fontSize: 13, fontWeight: '700', color: '#FFFBF1', letterSpacing: 0.2 },
});
