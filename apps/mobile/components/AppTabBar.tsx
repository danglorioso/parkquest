import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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

  const barHeight = Platform.OS === 'ios' ? 84 : 64;
  const paddingBottom = Platform.OS === 'ios' ? Math.max(insets.bottom, 20) : 8;

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
            {/* Upper-left radial brightening */}
            <View style={styles.fabRadial} pointerEvents="none" />
            {/* Specular highlight dot */}
            <View style={styles.fabSpecular} pointerEvents="none" />
            {/* Inner rim — bright top-left edge */}
            <View style={styles.fabRimLight} pointerEvents="none" />
            {/* Inner rim — dark bottom-right edge */}
            <View style={styles.fabRimDark} pointerEvents="none" />
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
    fontSize: 11,
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
  fabRadial: {
    position: 'absolute',
    top: -8, left: -8,
    width: 36, height: 30,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  fabSpecular: {
    position: 'absolute',
    top: 6, left: 7,
    width: 11, height: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.82)',
  },
  fabRimLight: {
    position: 'absolute',
    top: 2, left: 2, right: 2, bottom: 2,
    borderRadius: 19,
    borderWidth: 1.5,
    borderTopColor: 'rgba(255,255,255,0.60)',
    borderLeftColor: 'rgba(255,255,255,0.38)',
    borderBottomColor: 'transparent',
    borderRightColor: 'transparent',
  },
  fabRimDark: {
    position: 'absolute',
    top: 2, left: 2, right: 2, bottom: 2,
    borderRadius: 19,
    borderWidth: 1.5,
    borderTopColor: 'transparent',
    borderLeftColor: 'transparent',
    borderBottomColor: 'rgba(0,0,0,0.40)',
    borderRightColor: 'rgba(0,0,0,0.25)',
  },
});
