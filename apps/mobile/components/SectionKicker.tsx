import { StyleSheet, Text, TextStyle } from 'react-native';

// Mono uppercase section label — matches web `<SectionKicker>` used throughout.

export interface SectionKickerProps {
  children: string;
  style?:   TextStyle;
}

export function SectionKicker({ children, style }: SectionKickerProps) {
  return <Text style={[s.kicker, style]}>{children.toUpperCase()}</Text>;
}

const s = StyleSheet.create({
  kicker: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7A746A',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontVariant: ['tabular-nums'],
  },
});
