import { Tabs, useRouter } from 'expo-router';
import { TouchableOpacity, View, StyleSheet, Platform } from 'react-native';
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
      <View style={styles.fab}>
        <Ionicons name="add" size={30} color="#FFFBF1" />
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
  fab: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    // Warm shadow that matches the accent color
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.40,
    shadowRadius: 10,
    elevation: 8,
  },
});
