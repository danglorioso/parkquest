import { Tabs, useRouter } from 'expo-router';
import { DeviceEventEmitter, TouchableOpacity, View, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '../../lib/palette';

const STATIC = {
  surface:  '#FFFBF1',
  inkMute:  '#7A746A',
  hairline: 'rgba(27,26,22,0.10)',
};

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({
  focused,
  name,
  activeName,
  size = 24,
  primary,
}: {
  focused: boolean;
  name: IconName;
  activeName: IconName;
  size?: number;
  primary: string;
}) {
  return (
    <Ionicons
      name={focused ? activeName : name}
      size={size}
      color={focused ? primary : STATIC.inkMute}
    />
  );
}

function LogVisitButton() {
  const router = useRouter();
  const C = useColors();
  return (
    <TouchableOpacity
      onPress={() => router.push('/(modals)/log-visit')}
      accessibilityLabel="Log a park visit"
      accessibilityRole="button"
      style={styles.fabWrapper}
    >
      <View style={[styles.fabGlow, { backgroundColor: C.accent }]}>
        <View style={[styles.fab, { backgroundColor: C.accent }]}>
          <LinearGradient
            colors={['rgba(255,200,150,0.38)', 'transparent', 'rgba(0,0,0,0.34)']}
            locations={[0, 0.48, 1]}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />
          <Ionicons name="add" size={26} color="#FFFBF1" />
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function TabsLayout() {
  const C = useColors();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.primary,
        tabBarInactiveTintColor: STATIC.inkMute,
        tabBarStyle: {
          backgroundColor: STATIC.surface,
          borderTopColor: STATIC.hairline,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: Platform.OS === 'ios' ? 84 : 64,
          paddingBottom: Platform.OS === 'ios' ? 28 : 8,
          paddingTop: 8,
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
            <TabIcon focused={focused} name="newspaper-outline" activeName="newspaper" primary={C.primary} />
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
            <TabIcon focused={focused} name="map-outline" activeName="map" primary={C.primary} />
          ),
          tabBarStyle: {
            position: 'absolute',
            backgroundColor: 'rgba(255,251,241,0.88)',
            borderTopColor: STATIC.hairline,
            borderTopWidth: StyleSheet.hairlineWidth,
            height: Platform.OS === 'ios' ? 84 : 64,
            paddingBottom: Platform.OS === 'ios' ? 28 : 8,
            paddingTop: 8,
            paddingHorizontal: Platform.OS === 'ios' ? 14 : 6,
          },
        }}
      />
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
            <TabIcon focused={focused} name="compass-outline" activeName="compass" size={26} primary={C.primary} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} name="person-outline" activeName="person" primary={C.primary} />
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
  fabGlow: {
    borderRadius: 26,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.42,
    shadowRadius: 8,
    elevation: 12,
  },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 0.75,
    borderColor: 'rgba(255,255,255,0.22)',
  },
});
