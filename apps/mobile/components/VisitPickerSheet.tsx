import { useEffect, useRef } from 'react';
import {
  Animated, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { STATIC as C, useColors } from '@/lib/palette';

interface VisitSummary {
  id: number;
  visited_date: string;
  title?: string | null;
}

// Tap-through list for picking which logged visit to edit, when a park has
// more than one — same slide-up sheet pattern as FriendsVisitedSheet.
export function VisitPickerSheet({
  visits, onSelect, onClose,
}: { visits: VisitSummary[]; onSelect: (id: number) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const T = useColors();

  const slide = useRef(new Animated.Value(400)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slide, { toValue: 0, duration: 260, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
    ]).start();
  }, [slide, backdropOpacity]);

  const dismiss = (after?: () => void) => {
    Animated.parallel([
      Animated.timing(slide, { toValue: 400, duration: 200, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => { onClose(); after?.(); });
  };

  return (
    <Modal visible transparent animationType="none" onRequestClose={() => dismiss()} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdropOpacity }]}
          pointerEvents="none"
        />
        <Pressable style={StyleSheet.absoluteFill} onPress={() => dismiss()} />
        <Animated.View
          style={[styles.sheet, { paddingBottom: insets.bottom + 8, transform: [{ translateY: slide }] }]}
        >
          <View style={styles.handle} />
          <Text style={styles.title}>WHICH VISIT?</Text>
          <ScrollView style={{ maxHeight: 380 }} bounces={false}>
            {visits.map(v => {
              const dateLabel = new Date(v.visited_date).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
              });
              return (
                <TouchableOpacity
                  key={v.id}
                  style={styles.row}
                  activeOpacity={0.7}
                  onPress={() => dismiss(() => onSelect(v.id))}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.date}>{dateLabel}</Text>
                    {v.title ? <Text style={styles.sub} numberOfLines={1}>{v.title}</Text> : null}
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={T.inkMute} />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 18, borderTopRightRadius: 18,
    paddingTop: 8, paddingBottom: 34,
  },
  handle: {
    alignSelf: 'center', width: 36, height: 4, borderRadius: 2,
    backgroundColor: C.hairline, marginBottom: 10,
  },
  title: {
    textAlign: 'center', fontSize: 13, fontWeight: '700',
    color: C.inkMute, letterSpacing: 1.2,
    paddingBottom: 10, borderBottomWidth: 0.5, borderBottomColor: C.hairlineSoft,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 18, paddingVertical: 12,
  },
  date: { fontSize: 14, fontWeight: '600', color: C.ink },
  sub: { fontSize: 13, color: C.inkMute, marginTop: 1 },
});
