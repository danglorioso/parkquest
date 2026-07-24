import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dyn, useColors } from './palette';
import { useTabBarSpace } from '@/components/FloatingTabBar';

type ToastKind = 'success' | 'error';
interface ToastMsg { id: number; text: string; kind: ToastKind }

let listeners: ((msg: ToastMsg) => void)[] = [];
let seq = 0;

export function showToast(text: string, kind: ToastKind = 'success') {
  const msg: ToastMsg = { id: ++seq, text, kind };
  listeners.forEach(l => l(msg));
}

export function ToastHost() {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const tabBarSpace = useTabBarSpace();
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (next: ToastMsg) => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setMsg(next);
      opacity.setValue(0);
      translateY.setValue(20);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 18 }),
      ]).start();
      hideTimer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setMsg(null));
      }, 2600);
    };
    listeners.push(handler);
    return () => { listeners = listeners.filter(l => l !== handler); };
  }, []);

  if (!msg) return null;

  return (
    <Animated.View
      pointerEvents="none"
      // Bottom-anchored (was pinned under the status bar) — clears the
      // floating tab bar on tab screens; non-tab screens just get some
      // extra breathing room above the home indicator instead.
      style={[styles.wrap, { bottom: Math.max(tabBarSpace, insets.bottom + 24), opacity, transform: [{ translateY }] }]}
    >
      {/* Pill stays dark in both themes (cream text needs a dark backdrop) —
          in dark mode it's a slightly elevated tone with a hairline ring so it
          still separates from the near-black background. */}
      <View style={[styles.pill, {
        backgroundColor: dyn('#1B1A16', '#2B2720'),
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: dyn('rgba(255,251,241,0.08)', 'rgba(240,234,217,0.18)'),
      }]}>
        <Ionicons
          name={msg.kind === 'success' ? 'checkmark-circle' : 'alert-circle'}
          size={16}
          color={msg.kind === 'success' ? '#6EE7B7' : '#FCA5A5'}
        />
        <Text style={[styles.text, { color: C.onPrimary }]} numberOfLines={2}>{msg.text}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute', left: 16, right: 16, alignItems: 'center', zIndex: 999,
  },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 100,
    maxWidth: '92%',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  text: { fontSize: 13.5, fontWeight: '600', flexShrink: 1 },
});
