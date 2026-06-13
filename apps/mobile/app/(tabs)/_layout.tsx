import { Tabs, useRouter } from 'expo-router';
import { DeviceEventEmitter, TouchableOpacity, View, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Design tokens — mirrors globals.css
const C = {
  bg:       '#F2EBDB',
  surface:  '#FFFBF1',
  primary:  '#1F3D2E',
  inkMute:  '#7A746A',
  accent:   '#C56B3D',
  hairline: 'rgba(27,26,22,0.10)',
};

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({
  focused,
  name,
  activeName,
  size = 24,
}: {
  focused: boolean;
  name: IconName;
  activeName: IconName;
  size?: number;
}) {
  return (
    <Ionicons
      name={focused ? activeName : name}
      size={size}
      color={focused ? C.primary : C.inkMute}
    />
  );
}

function LogVisitButton() {
  const router = useRouter();
  return (
    <TouchableOpacity
      onPress={() => router.push('/(modals)/log-visit')}
      accessibilityLabel="Log a park visit"
      accessibilityRole="button"
      style={styles.fabWrapper}
    >
      <View style={styles.fabGlow}>
        <View style={styles.fab}>
          <Ionicons name="add" size={22} color="#FFFBF1" />
          <View style={styles.fabHighlight} pointerEvents="none" />
          <View style={styles.fabInnerShadow} pointerEvents="none" />
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.primary,
        tabBarInactiveTintColor: C.inkMute,
        tabBarStyle: {
          backgroundColor: C.surface,
          borderTopColor: C.hairline,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: Platform.OS === 'ios' ? 84 : 64,
          paddingBottom: Platform.OS === 'ios' ? 28 : 8,
          paddingTop: 8,
          // Inset outer tabs away from the screen's rounded corners
          paddingHorizontal: Platform.OS === 'ios' ? 14 : 6,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
          letterSpacing: 0.2,
        },
      }}
    >
      <Tabs.Screen
        name="feed"
        listeners={({ navigation }) => ({
          tabPress: () => {
            if (navigation.isFocused()) {
              DeviceEventEmitter.emit('feedTabPress');
            }
          },
        })}
        options={{
          title: 'Feed',
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} name="newspaper-outline" activeName="newspaper" />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        listeners={({ navigation }) => ({
          tabPress: () => {
            if (navigation.isFocused()) {
              DeviceEventEmitter.emit('mapTabPress');
            }
          },
        })}
        options={{
          title: 'Map',
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} name="map-outline" activeName="map" />
          ),
          // Float the tab bar over the full-bleed map
          tabBarStyle: {
            position: 'absolute',
            backgroundColor: 'rgba(255,251,241,0.88)',
            borderTopColor: C.hairline,
            borderTopWidth: StyleSheet.hairlineWidth,
            height: Platform.OS === 'ios' ? 84 : 64,
            paddingBottom: Platform.OS === 'ios' ? 28 : 8,
            paddingTop: 8,
            paddingHorizontal: Platform.OS === 'ios' ? 14 : 6,
          },
        }}
      />
      {/* Center FAB — no real tab route, button opens modal */}
      <Tabs.Screen
        name="log-visit-placeholder"
        options={{
          title: '',
          tabBarButton: () => <LogVisitButton />,
        }}
      />
      <Tabs.Screen
        name="parks"
        options={{
          title: 'Parks',
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} name="compass-outline" activeName="compass" size={26} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} name="person-outline" activeName="person" />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  fabWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Soft halo radiating evenly from the edge — outer layer is a wide diffuse
  // glow, inner layer adds a tighter drop for depth (iOS stacks both;
  // Android approximates with elevation)
  fabGlow: {
    borderRadius: 18,
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  fab: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  fabHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '45%',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  fabInnerShadow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '45%',
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    backgroundColor: 'rgba(110,35,0,0.28)',
  },
});
