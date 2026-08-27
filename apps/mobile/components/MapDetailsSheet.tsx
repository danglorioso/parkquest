import { useEffect, useRef } from 'react';
import {
  Animated, Modal, PanResponder, Pressable, StyleSheet, Switch, Text, TouchableOpacity, View,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { STATIC as C, dyn, useColors } from '@/lib/palette';
import { PARK_TYPES } from '@/lib/parkTypes';

// One consolidated "how the map is displayed" sheet — Apple Maps' own "Map
// Details" pattern (a single bottom-right button opening a grouped sheet)
// instead of three separate floating pills competing for attention along
// the top edge. Same slide-up structure as VisitPickerSheet/FriendsVisitedSheet.

export interface StatusOption { key: string; dot: string; label: string; count: number }

interface Props {
  onClose: () => void;
  statusOptions: StatusOption[];
  activeStatus: string;
  onSelectStatus: (key: string) => void;
  enabledParkTypes: Set<string>;
  parkTypeCounts: Record<string, number>;
  onToggleParkType: (key: string) => void;
  labelsEnabled: boolean;
  onLabelsEnabledChange: (v: boolean) => void;
  labelFontSize: number;
  onLabelFontSizeChange: (v: number) => void;
  labelFontMin: number;
  labelFontMax: number;
}

export function MapDetailsSheet({
  onClose,
  statusOptions, activeStatus, onSelectStatus,
  enabledParkTypes, parkTypeCounts, onToggleParkType,
  labelsEnabled, onLabelsEnabledChange, labelFontSize, onLabelFontSizeChange, labelFontMin, labelFontMax,
}: Props) {
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

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(slide, { toValue: 400, duration: 200, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  // Swipe DOWN to dismiss (mirrors SearchOverlay's swipe-up-to-dismiss) —
  // grabbed from the handle bar only, so it doesn't steal drags meant for
  // the Slider/Switch/rows below.
  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, { dy }) => dy > 6,
    onPanResponderMove: (_, { dy }) => { if (dy > 0) slide.setValue(dy); },
    onPanResponderRelease: (_, { dy, vy }) => {
      if (dy > 80 || vy > 0.8) {
        Animated.parallel([
          Animated.timing(slide, { toValue: 400, duration: 200, useNativeDriver: true }),
          Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]).start(() => onClose());
      } else {
        Animated.spring(slide, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
      }
    },
  })).current;

  return (
    <Modal visible transparent animationType="none" onRequestClose={dismiss} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdropOpacity }]}
          pointerEvents="none"
        />
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />
        <Animated.View
          style={[styles.sheet, { paddingBottom: insets.bottom + 8, transform: [{ translateY: slide }] }]}
        >
          <View style={styles.handleGrabZone} {...panResponder.panHandlers}>
            <View style={styles.handle} />
          </View>

          {/* ── Status — single-select ── */}
          <Text style={[styles.sectionLabel, { marginTop: 4 }]}>Status</Text>
          <View style={styles.section}>
            {statusOptions.map((s, i) => {
              const active = s.key === activeStatus;
              const isFirst = i === 0;
              const isLast = i === statusOptions.length - 1;
              return (
                <TouchableOpacity
                  key={s.key}
                  onPress={() => onSelectStatus(s.key)}
                  activeOpacity={0.7}
                  style={[styles.row, i < statusOptions.length - 1 && styles.rowBorder]}
                >
                  {active && (
                    // Two stacked radius-only rects (no borderWidth on
                    // either) instead of an actual RN border — a rounded
                    // corner combined with borderWidth is the iOS "gray
                    // band" bug (see log-visit.tsx's date sheet comment),
                    // and a SQUARE border paired with this rounded fill
                    // just moved the mismatch to the opposite layer instead
                    // of fixing it. Drawing the "border" as a slightly
                    // bigger colored rect peeking out from behind the inset
                    // fill sidesteps the bug entirely — both layers round
                    // together since they're both plain radius, no stroke.
                    <>
                      <View
                        pointerEvents="none"
                        style={[
                          StyleSheet.absoluteFill,
                          styles.rowActiveBorder,
                          isFirst && styles.rowActiveRadiusFirst,
                          isLast && styles.rowActiveRadiusLast,
                        ]}
                      />
                      <View
                        pointerEvents="none"
                        style={[
                          styles.rowActiveFill,
                          isFirst && styles.rowActiveRadiusFirst,
                          isLast && styles.rowActiveRadiusLast,
                        ]}
                      />
                    </>
                  )}
                  <View style={[styles.dot, { backgroundColor: s.dot }]} />
                  <Text style={[styles.rowLabel, active && styles.rowLabelActive]}>{s.label}</Text>
                  <Text style={styles.rowCount}>{s.count}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Park types — multi-select ── */}
          <Text style={styles.sectionLabel}>Park types</Text>
          <View style={styles.section}>
            {PARK_TYPES.map((t, i) => {
              const checked = enabledParkTypes.has(t.key);
              return (
                <TouchableOpacity
                  key={t.key}
                  onPress={() => onToggleParkType(t.key)}
                  activeOpacity={0.7}
                  style={[styles.row, i < PARK_TYPES.length - 1 && styles.rowBorder]}
                >
                  <Ionicons
                    name={checked ? 'checkbox' : 'square-outline'}
                    size={19}
                    color={checked ? T.primary : C.inkMute}
                  />
                  <Text style={[styles.rowLabel, checked && styles.rowLabelActive]}>{t.label}</Text>
                  <Text style={styles.rowCount}>{parkTypeCounts[t.key] ?? 0}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Labels ── */}
          <Text style={styles.sectionLabel}>Labels</Text>
          <View style={styles.section}>
            <View style={[styles.row, styles.rowBorder]}>
              <Text style={[styles.rowLabel, styles.rowLabelActive, { flex: 1 }]}>Show labels</Text>
              <Switch
                value={labelsEnabled}
                onValueChange={onLabelsEnabledChange}
                trackColor={{ true: T.primary }}
              />
            </View>
            <View style={[styles.row, { opacity: labelsEnabled ? 1 : 0.4 }]}>
              <Text style={{ fontSize: 10, color: C.inkMute }}>A</Text>
              <Slider
                style={{ flex: 1, height: 28, marginHorizontal: 8 }}
                minimumValue={labelFontMin}
                maximumValue={labelFontMax}
                step={0.5}
                value={labelFontSize}
                onValueChange={onLabelFontSizeChange}
                disabled={!labelsEnabled}
                minimumTrackTintColor={T.primary as string}
                maximumTrackTintColor={C.hairline as unknown as string}
              />
              <Text style={{ fontSize: 16, color: C.inkMute }}>A</Text>
            </View>
          </View>
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
    paddingTop: 8, paddingHorizontal: 18, paddingBottom: 34,
  },
  handleGrabZone: {
    alignItems: 'center', paddingTop: 2, paddingBottom: 12, marginTop: -2,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: C.hairline,
  },
  sectionLabel: {
    fontSize: 15, fontWeight: '700', color: C.ink,
    letterSpacing: 0.2,
    marginTop: 18, marginBottom: 8,
  },
  section: {
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: C.hairline,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 11,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.hairline,
  },
  // Full-bleed colored rect, sits behind rowActiveFill — the 1.5px ring
  // that peeks out around the inset fill below IS the "border". No
  // borderWidth property anywhere on this, just a flat backgroundColor.
  rowActiveBorder: {
    backgroundColor: dyn('rgba(31,61,46,0.55)', 'rgba(240,234,217,0.5)'),
  },
  // Inset 1.5px from rowActiveBorder on every side, revealing the ring.
  rowActiveFill: {
    position: 'absolute', top: 1.5, left: 1.5, right: 1.5, bottom: 1.5,
    backgroundColor: dyn('rgba(31,61,46,0.08)', 'rgba(240,234,217,0.12)'),
  },
  rowActiveRadiusFirst: { borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  rowActiveRadiusLast: { borderBottomLeftRadius: 10, borderBottomRightRadius: 10 },
  dot: { width: 9, height: 9, borderRadius: 4.5 },
  rowLabel: { fontSize: 14, fontWeight: '600', color: C.inkSoft },
  rowLabelActive: { color: C.ink },
  rowCount: { marginLeft: 'auto', fontSize: 13, fontWeight: '600', color: C.inkMute, fontVariant: ['tabular-nums'] },
});
