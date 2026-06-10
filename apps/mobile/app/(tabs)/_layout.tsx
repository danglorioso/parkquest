import { Tabs, useRouter } from 'expo-router';
import { TouchableOpacity, View, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

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
}: {
  focused: boolean;
  name: IconName;
  activeName: IconName;
}) {
  return (
    <Ionicons
      name={focused ? activeName : name}
      size={24}
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
      <View style={styles.fabShadow}>
        <LinearGradient
          colors={['#DC8552', C.accent, '#9E5128']}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={styles.fab}
        >
          {/* Glossy sheen — light catching the top of the dome */}
          <LinearGradient
            colors={['rgba(255,255,255,0.38)', 'rgba(255,255,255,0.08)', 'transparent']}
            style={styles.fabGloss}
            pointerEvents="none"
          />
          <Ionicons name="add" size={30} color="#FFFBF1" />
        </LinearGradient>
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
        options={{
          title: 'Feed',
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} name="newspaper-outline" activeName="newspaper" />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
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
            <TabIcon focused={focused} name="compass-outline" activeName="compass" />
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
    // Lift the button so it floats above the tab bar baseline
    marginBottom: Platform.OS === 'ios' ? 14 : 4,
  },
  // Shadow lives on an outer view so the gradient can clip to the circle
  // without iOS clipping the shadow along with it
  fabShadow: {
    borderRadius: 29,
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.40,
    shadowRadius: 10,
    elevation: 8,
  },
  fab: {
    width: 58,
    height: 58,
    borderRadius: 29,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    // Hairline rim light on the upper edge sells the 3D dome
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  fabGloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 30,
  },
});
