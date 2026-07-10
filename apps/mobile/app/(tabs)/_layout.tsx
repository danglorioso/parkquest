import { useEffect, useState } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { DeviceEventEmitter, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { STATIC, useColors } from '../../lib/palette';
import FloatingTabBar from '../../components/FloatingTabBar';
import { hasDrafts, onDraftsChanged } from '../../lib/drafts';
import { OnboardingWalkthrough } from '../../components/OnboardingWalkthrough';
import { GlassView, liquidGlassAvailable } from '../../lib/glass';

const glass = liquidGlassAvailable && GlassView != null;

// LogVisitButton always uses this orange, independent of the user's chosen
// park theme (fabAccent varies per theme and can go blue/red/green).
const FAB_ACCENT = '#C56B3D';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({
  focused,
  name,
  activeName,
  size = 25,
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
  const [hasDraft, setHasDraft] = useState(false);

  useEffect(() => {
    hasDrafts().then(setHasDraft);
    return onDraftsChanged(() => { hasDrafts().then(setHasDraft); });
  }, []);

  return (
    <TouchableOpacity
      onPress={() => {
        DeviceEventEmitter.emit('logVisitFabPress');
        router.push('/(modals)/log-visit');
      }}
      accessibilityLabel={hasDraft ? 'Log a park visit — draft saved' : 'Log a park visit'}
      accessibilityRole="button"
      style={styles.fabWrapper}
    >
      <View style={[styles.fabGlow, !glass && { backgroundColor: FAB_ACCENT }]}>
        {glass && GlassView ? (
          <GlassView
            style={styles.fab}
            glassEffectStyle="regular"
            tintColor={FAB_ACCENT}
            isInteractive
          >
            <Ionicons name="add" size={26} color="#FFFBF1" />
          </GlassView>
        ) : (
          <View style={[styles.fab, styles.fabFallback, { backgroundColor: FAB_ACCENT }]}>
            <Ionicons name="add" size={26} color="#FFFBF1" />
          </View>
        )}
        {hasDraft && <View style={styles.draftDot} />}
      </View>
    </TouchableOpacity>
  );
}

export default function TabsLayout() {
  const C = useColors();

  return (
    <>
      <Tabs
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{ headerShown: false }}
      >
        <Tabs.Screen
          name="feed"
          listeners={({ navigation }) => ({
            tabPress: () => {
              // Nested feed stack: only refresh when already sitting on the
              // feed list itself. If we're pushed into a park detail screen,
              // let the default tabPress action pop the stack back to the
              // list without also refetching/scroll-animating the feed.
              if (navigation.isFocused()) {
                const state = navigation.getState();
                const feedRoute = state.routes[state.index];
                const nestedIndex = (feedRoute as { state?: { index?: number } }).state?.index ?? 0;
                if (nestedIndex === 0) {
                  DeviceEventEmitter.emit('feedTabPress');
                }
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
              <TabIcon focused={focused} name="compass-outline" activeName="compass" size={27} primary={C.primary} />
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
      <OnboardingWalkthrough />
    </>
  );
}

const styles = StyleSheet.create({
  fabWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabGlow: {
    borderRadius: 36,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.38,
    shadowRadius: 7,
    elevation: 12,
  },
  draftDot: {
    position: 'absolute', top: -1, right: -1,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: '#DC2626',
    borderWidth: 1.5, borderColor: '#FFFBF1',
  },
  fab: {
    width: 50,
    height: 50,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  // Only used where real liquid glass isn't available (Expo Go, pre-glass
  // dev clients, Android). Hand-painted convex glass: crisp rim light
  // hugging the top edge, a broad soft sheen below it, then a crisp dark
  // inner edge and deep falloff at the bottom — tight blurs read as a
  // curved surface, big blurs as a wash.
  fabFallback: {
    borderWidth: 0.75,
    borderColor: 'rgba(255,255,255,0.28)',
    boxShadow: [
      'inset 0 1.5 1 rgba(255,255,255,0.6)',
      'inset 0 8 12 rgba(255,255,255,0.16)',
      'inset 0 -1.5 1 rgba(0,0,0,0.35)',
      'inset 0 -8 12 rgba(0,0,0,0.2)',
    ].join(', '),
  },
});
