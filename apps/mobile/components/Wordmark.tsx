import { View, Text } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';

const PRIMARY = '#1F3D2E';
const ACCENT2 = '#D89A3A';

export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={PRIMARY}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ marginTop: -2 }}
      >
        <Path d="M3 20L9 9l3 5 3-7 6 13H3z" />
        <Circle cx={20} cy={4} r={3.5} fill={ACCENT2} stroke="none" />
      </Svg>
      <Text style={{ fontWeight: '800', fontSize: 18, letterSpacing: -0.4, lineHeight: 22, color: PRIMARY }}>
        Park<Text style={{ fontWeight: '500' }}>Quest</Text>
      </Text>
    </View>
  );
}
