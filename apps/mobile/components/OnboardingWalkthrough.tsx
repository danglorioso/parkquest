import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { STATIC as C, useColors } from '@/lib/palette';
import { Wordmark } from '@/components/Wordmark';

// First-run walkthrough — shown once, right after a new user lands in the main
// tabs. Deliberately simple: a handful of static steps in a centered card, no
// gestures or animation library beyond what Modal gives us for free.
const SEEN_KEY = 'pq-has-seen-onboarding';

interface Step {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    title: 'Welcome to ParkQuest',
    body: 'Chase all 63 U.S. National Parks, log every visit, and leave your mark. Here\'s a quick look around.',
  },
  {
    icon: 'map-outline',
    title: 'Track every park',
    body: 'The Map tab shows all 63 parks at a glance — tap a pin to check it out, mark it visited, or save it to your bucket list.',
  },
  {
    icon: 'add-circle-outline',
    title: 'Log a visit',
    body: 'Tap the + button anytime to log a trip: a rating, photos, notes, and who came along.',
  },
  {
    icon: 'newspaper-outline',
    title: 'Follow the feed',
    body: 'The Feed tab is where trip photos, badges, and updates from friends and fellow explorers show up.',
  },
  {
    icon: 'people-outline',
    title: 'Add your friends',
    body: 'Head to Profile to build your passport, earn badges, and add friends to see where they\'ve been.',
  },
];

export function OnboardingWalkthrough() {
  const T = useColors();
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  const cardScale = useRef(new Animated.Value(0.9)).current;
  const cardFade = useRef(new Animated.Value(0)).current;
  const stepFade = useRef(new Animated.Value(1)).current;
  const stepRise = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AsyncStorage.getItem(SEEN_KEY).then(seen => {
      if (!seen) setVisible(true);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(cardFade, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(cardScale, { toValue: 1, friction: 8, tension: 60, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const goToStep = (next: number) => {
    Animated.parallel([
      Animated.timing(stepFade, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(stepRise, { toValue: -8, duration: 120, useNativeDriver: true }),
    ]).start(() => {
      setStep(next);
      stepRise.setValue(8);
      Animated.parallel([
        Animated.timing(stepFade, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(stepRise, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start();
    });
  };

  const finish = () => {
    setVisible(false);
    AsyncStorage.setItem(SEEN_KEY, 'true').catch(() => {});
  };

  const findFriends = () => {
    finish();
    // Seed the profile tab's stack with its root before pushing the nested
    // friends screen — pushing the nested route directly (while a different
    // tab is focused) left that stack as just [friends] with no index
    // beneath it: no back button, and every later Profile tap re-focused
    // that same stale stack instead of resetting to the profile root.
    router.navigate('/(tabs)/profile' as never);
    router.navigate('/(tabs)/profile/friends' as never);
  };

  if (!visible) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={finish}>
      <View style={styles.backdrop}>
        <Animated.View
          style={[
            styles.card,
            { opacity: cardFade, transform: [{ scale: cardScale }] },
          ]}
        >
          <TouchableOpacity style={styles.skip} onPress={finish} hitSlop={10}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>

          <Animated.View
            style={{ opacity: stepFade, transform: [{ translateY: stepRise }], alignItems: 'center' }}
          >
            {step === 0 ? (
              <View style={styles.wordmarkBox}>
                <Wordmark size={30} />
              </View>
            ) : (
              <View style={[styles.iconBox, { backgroundColor: `${T.primary}14` }]}>
                <Ionicons name={current.icon!} size={28} color={T.primary} />
              </View>
            )}

            <Text style={styles.title}>{current.title}</Text>
            <Text style={styles.body}>{current.body}</Text>
          </Animated.View>

          <View style={styles.dots}>
            {STEPS.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  { width: i === step ? 18 : 6, backgroundColor: i <= step ? T.primary : C.hairline },
                ]}
              />
            ))}
          </View>

          {isLast && (
            <TouchableOpacity
              style={[styles.findFriendsBtn, { borderColor: T.primary }]}
              onPress={findFriends}
              activeOpacity={0.85}
            >
              <Ionicons name="search" size={14} color={T.primary} />
              <Text style={[styles.findFriendsText, { color: T.primary }]}>Find friends</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.nextBtn, { backgroundColor: T.primary }]}
            onPress={isLast ? finish : () => goToStep(step + 1)}
            activeOpacity={0.85}
          >
            <Text style={styles.nextText}>{isLast ? 'Get started' : 'Next'}</Text>
            {!isLast && <Ionicons name="arrow-forward" size={14} color={C.onPrimary} />}
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: C.surface,
    borderRadius: 24,
    borderWidth: 0.5,
    borderColor: C.hairline,
    padding: 24,
    paddingTop: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  skip: {
    position: 'absolute', top: 14, right: 14, zIndex: 1,
    paddingHorizontal: 8, paddingVertical: 6,
  },
  skipText: { fontSize: 13, fontWeight: '600', color: C.inkMute },
  wordmarkBox: { height: 64, justifyContent: 'center', marginBottom: 16 },
  iconBox: {
    width: 64, height: 64, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  title: {
    fontSize: 19, fontWeight: '800', color: C.ink,
    textAlign: 'center', letterSpacing: -0.3, marginBottom: 8,
  },
  body: {
    fontSize: 14, color: C.inkMute, textAlign: 'center',
    lineHeight: 20, minHeight: 60, marginBottom: 20,
  },
  dots: { flexDirection: 'row', gap: 5, marginBottom: 20 },
  findFriendsBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    alignSelf: 'stretch',
    paddingHorizontal: 22, paddingVertical: 13, borderRadius: 100,
    borderWidth: 1.5, marginBottom: 10,
  },
  findFriendsText: { fontSize: 14, fontWeight: '800' },
  dot: { height: 6, borderRadius: 3 },
  nextBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    alignSelf: 'stretch',
    paddingHorizontal: 22, paddingVertical: 13, borderRadius: 100,
  },
  nextText: { fontSize: 14, fontWeight: '800', color: C.onPrimary },
});
