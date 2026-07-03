import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/lib/palette';

const STATIC = {
  surface:  '#FFFBF1',
  inkMute:  '#7A746A',
  hairline: 'rgba(27,26,22,0.10)',
};

type Tab = 'feed' | 'map' | 'parks' | 'profile';
type IconName = React.ComponentProps<typeof Ionicons>['name'];

const TABS: { key: Tab; label: string; icon: IconName; activeIcon: IconName; size?: number }[] = [
  { key: 'feed',    label: 'Feed',    icon: 'newspaper-outline', activeIcon: 'newspaper' },
  { key: 'map',     label: 'Map',     icon: 'map-outline',       activeIcon: 'map' },
  { key: 'parks',   label: 'Parks',   icon: 'compass-outline',   activeIcon: 'compass',  size: 26 },
  { key: 'profile', label: 'Profile', icon: 'person-outline',    activeIcon: 'person' },
];

const ROUTES: Record<Tab, string> = {
  feed:    '/(tabs)/feed',
  map:     '/(tabs)/map',
  parks:   '/(tabs)/parks',
  profile: '/(tabs)/profile',
};

export default function AppTabBar({ activeTab }: { activeTab: Tab }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const C = useColors();

  // Pull the bar closer to the screen edge: the full home-indicator inset (34pt
  // on Face ID iPhones) leaves too much dead space below the icons
  const paddingBottom = Platform.OS === 'ios' ? Math.max(insets.bottom - 12, 12) : 8;
  const barHeight = Platform.OS === 'ios' ? paddingBottom + 54 : 64;

  return (
    <View style={[styles.bar, { height: barHeight, paddingBottom }]}>
      {TABS.slice(0, 2).map(tab => (
        <TabItem
          key={tab.key}
          tab={tab}
          focused={activeTab === tab.key}
          primary={C.primary}
          onPress={() => router.navigate(ROUTES[tab.key] as never)}
        />
      ))}

      <TouchableOpacity
        style={styles.fabWrapper}
        onPress={() => router.push('/(modals)/log-visit' as never)}
        accessibilityLabel="Log a park visit"
        accessibilityRole="button"
      >
        <View style={[styles.fabGlow, { shadowColor: C.accent }]}>
          <View style={[styles.fab, { backgroundColor: C.accent }]}>
            <Ionicons name="add" size={24} color="#FFFBF1" />
            {/* Rim glow — radial gradient from outer edge inward */}
            <Svg width={42} height={42} style={StyleSheet.absoluteFill} pointerEvents="none">
              <Defs>
                <RadialGradient id="rimGlow" cx="50%" cy="50%" r="50%">
                  <Stop offset="52%" stopColor="white" stopOpacity={0} />
                  <Stop offset="100%" stopColor="white" stopOpacity={0.38} />
                </RadialGradient>
              </Defs>
              <Circle cx={21} cy={21} r={21} fill="url(#rimGlow)" />
            </Svg>
          </View>
        </View>
      </TouchableOpacity>

      {TABS.slice(2).map(tab => (
        <TabItem
          key={tab.key}
          tab={tab}
          focused={activeTab === tab.key}
          primary={C.primary}
          onPress={() => router.navigate(ROUTES[tab.key] as never)}
        />
      ))}
    </View>
  );
}

function TabItem({
  tab, focused, primary, onPress,
}: {
  tab: typeof TABS[number];
  focused: boolean;
  primary: string;
  onPress: () => void;
}) {
  const color = focused ? primary : STATIC.inkMute;
  return (
    <TouchableOpacity style={styles.tabItem} onPress={onPress} activeOpacity={0.7}>
      <Ionicons
        name={focused ? tab.activeIcon : tab.icon}
        size={tab.size ?? 24}
        color={color}
      />
      <Text style={[styles.label, { color }]}>{tab.label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: STATIC.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: STATIC.hairline,
    paddingTop: 8,
    paddingHorizontal: Platform.OS === 'ios' ? 14 : 6,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  fabWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabGlow: {
    borderRadius: 21,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.40,
    shadowRadius: 8,
    elevation: 6,
  },
  fab: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
});
