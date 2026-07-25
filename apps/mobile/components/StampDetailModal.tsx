import { useEffect, useRef } from 'react';
import { Animated, Easing, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { CustomStampGlyph } from '@parkquest/types';
import { ParkStamp, stampColor } from '@/components/ParkStamp';
import { fullStateName } from '@/lib/stateNames';

// Stamp counterpart to BadgeDetailModal — same dark animated card, but the
// CTA row is "view your visits" (filtered journal) + "park info" instead of
// a share-to-feed button, since a stamp isn't a shareable feed post.

export interface StampDetailData {
  park_code: string;
  name: string;
  states: string;
  colorIdx: number;
  stamp_glyph: CustomStampGlyph | null;
  visited_date: string | null;
}

export function StampDetailModal({ stamp, onClose, onViewVisits, onParkInfo }: {
  stamp: StampDetailData;
  onClose: () => void;
  onViewVisits: (stamp: StampDetailData) => void;
  onParkInfo: (stamp: StampDetailData) => void;
}) {
  const ink = stampColor(stamp.colorIdx);
  const stampedDateStr = stamp.visited_date
    ? new Date(stamp.visited_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  // Entrance — matches BadgeDetailModal: card scales in, stamp pops with overshoot
  const cardAnim  = useRef(new Animated.Value(0)).current;
  const stampAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(cardAnim, {
        toValue: 1, duration: 240,
        easing: Easing.bezier(0.2, 0.8, 0.3, 1), useNativeDriver: true,
      }),
      Animated.timing(stampAnim, {
        toValue: 1, duration: 400, delay: 80,
        easing: Easing.bezier(0.34, 1.4, 0.64, 1), useNativeDriver: true,
      }),
    ]).start();
  }, [cardAnim, stampAnim]);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View style={[
          styles.modal,
          { borderColor: ink + '55' },
          {
            opacity: cardAnim,
            transform: [
              { scale:      cardAnim.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) },
              { translateY: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
            ],
          },
        ]}>
          <TouchableOpacity onPress={onClose} style={styles.modalClose}>
            <Ionicons name="close" size={16} color="rgba(255,251,241,0.55)" />
          </TouchableOpacity>

          <Animated.View style={{
            alignItems: 'center', justifyContent: 'center', paddingTop: 8,
            opacity: stampAnim,
            transform: [
              { scale:      stampAnim.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) },
              { translateY: stampAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
            ],
          }}>
            {/* Soft white glow so the stamp's dark ink reads against the card's
                near-black background — three falling-off rings stand in for a
                radial gradient, which RN has no built-in primitive for. */}
            <View style={styles.stampGlowRing3} pointerEvents="none" />
            <View style={styles.stampGlowRing2} pointerEvents="none" />
            <View style={styles.stampGlowRing1} pointerEvents="none" />
            <ParkStamp
              parkCode={stamp.park_code}
              name={stamp.name}
              states={stamp.states}
              colorIdx={stamp.colorIdx}
              size={130}
              customGlyph={stamp.stamp_glyph}
              idSuffix="-modal"
            />
          </Animated.View>

          <Text style={styles.modalName}>{stamp.name}</Text>
          <Text style={styles.modalDesc}>{fullStateName(stamp.states)}</Text>

          {stampedDateStr && (
            <View style={styles.earnedRow}>
              <Text style={styles.earnedText}>✦ Stamped {stampedDateStr}</Text>
            </View>
          )}

          <View style={styles.ctaRow}>
            <TouchableOpacity
              onPress={() => onViewVisits(stamp)}
              activeOpacity={0.8}
              style={styles.secondaryCta}
            >
              <Ionicons name="book-outline" size={14} color="#FFFBF1" />
              <Text style={styles.secondaryCtaText}>View your visits</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onParkInfo(stamp)}
              activeOpacity={0.8}
              style={styles.primaryCta}
            >
              <Ionicons name="information-circle-outline" size={14} color="#1B1A16" />
              <Text style={styles.primaryCtaText}>Park info</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(13,12,10,0.92)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  modal: {
    backgroundColor: 'rgba(22,22,18,0.97)',
    borderRadius: 20, borderWidth: 0.5,
    padding: 32, paddingTop: 36,
    width: '100%', maxWidth: 380,
    alignItems: 'center', overflow: 'hidden', position: 'relative',
    shadowColor: '#000', shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.5, shadowRadius: 40, elevation: 24,
  },
  modalClose: {
    position: 'absolute', top: 14, right: 14, zIndex: 10,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,251,241,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  modalName: {
    fontSize: 24, fontWeight: '800', color: '#FFFBF1', letterSpacing: -0.5,
    marginTop: 16, textAlign: 'center',
  },
  modalDesc: {
    fontSize: 13.5, color: 'rgba(255,251,241,0.65)',
    marginTop: 6, textAlign: 'center', lineHeight: 19,
  },
  earnedRow: {
    marginTop: 20, backgroundColor: 'rgba(255,251,241,0.07)',
    borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8,
  },
  earnedText: {
    fontSize: 13, fontWeight: '600', color: 'rgba(255,251,241,0.55)', letterSpacing: 0.6,
  },
  ctaRow: {
    flexDirection: 'column', gap: 8, marginTop: 20, width: '100%',
  },
  secondaryCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: 'rgba(255,251,241,0.10)', borderRadius: 100,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  secondaryCtaText: {
    fontSize: 12.5, fontWeight: '700', color: '#FFFBF1',
  },
  primaryCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#FFFBF1', borderRadius: 100,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  primaryCtaText: {
    fontSize: 12.5, fontWeight: '700', color: '#1B1A16',
  },
  stampGlowRing1: {
    position: 'absolute', width: 150, height: 150, borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  stampGlowRing2: {
    position: 'absolute', width: 185, height: 185, borderRadius: 92.5,
    backgroundColor: 'rgba(255,255,255,0.09)',
  },
  stampGlowRing3: {
    position: 'absolute', width: 225, height: 225, borderRadius: 112.5,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
});
