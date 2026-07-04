import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from './palette';

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
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (next: ToastMsg) => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setMsg(next);
      opacity.setValue(0);
      translateY.setValue(-20);
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
      style={[styles.wrap, { top: insets.top + 8, opacity, transform: [{ translateY }] }]}
    >
      <View style={[styles.pill, { backgroundColor: C.ink }]}>
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
