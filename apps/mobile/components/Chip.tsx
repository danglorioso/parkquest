import { ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { useColors, type Colors } from '@/lib/palette';

// Generic MetaChip — matches web `<Chip>` / `<MetaChip>` used in journal, parks, badges.

export interface ChipProps {
  children:  ReactNode;
  variant?:  'default' | 'primary' | 'accent' | 'success';
  size?:     'sm' | 'md';
  selected?: boolean;
  onPress?:  () => void;
  style?:    ViewStyle;
}

function variants(C: Colors) {
  return {
    default: { bg: C.surfaceAlt, border: C.hairline,    text: C.inkMute },
    primary: { bg: C.primary,    border: 'transparent', text: C.onPrimary },
    accent:  { bg: C.accent,     border: 'transparent', text: C.onPrimary },
    success: { bg: C.visited,    border: 'transparent', text: C.onPrimary },
  };
}

export function Chip({ children, variant = 'default', size = 'md', selected, onPress, style }: ChipProps) {
  const C = useColors();
  const v = variants(C)[variant];
  const px = size === 'sm' ? 8  : 12;
  const py = size === 'sm' ? 3  : 6;
  const fs = 13;

  const chipStyle = [
    s.base,
    { backgroundColor: selected ? C.primary : v.bg, borderColor: v.border },
    { paddingHorizontal: px, paddingVertical: py },
    style,
  ];
  const textStyle = [
    s.text,
    { fontSize: fs, color: selected ? C.onPrimary : v.text },
  ];

  if (onPress) {
    return (
      <TouchableOpacity style={chipStyle} onPress={onPress} activeOpacity={0.75}>
        {typeof children === 'string'
          ? <Text style={textStyle}>{children}</Text>
          : children}
      </TouchableOpacity>
    );
  }

  return (
    <View style={chipStyle}>
      {typeof children === 'string'
        ? <Text style={textStyle}>{children}</Text>
        : children}
    </View>
  );
}

const s = StyleSheet.create({
  base: {
    borderRadius: 100, borderWidth: 0.5,
    alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 4,
    alignSelf: 'flex-start',
  },
  text: { fontWeight: '600', letterSpacing: 0.1 },
});
