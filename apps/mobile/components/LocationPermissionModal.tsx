import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { STATIC as C, useColors } from '@/lib/palette';

// Custom pre-permission explainer shown once, before the native location
// prompt — same visual language as OnboardingWalkthrough's card.
export function LocationPermissionModal({
  visible,
  onAllow,
  onDismiss,
}: {
  visible: boolean;
  onAllow: () => void;
  onDismiss: () => void;
}) {
  const T = useColors();
  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={[styles.iconBox, { backgroundColor: `${T.primary}14` }]}>
            <Ionicons name="location-outline" size={28} color={T.primary} />
          </View>
          <Text style={styles.title}>Find parks near you</Text>
          <Text style={styles.body}>
            ParkQuest uses your location to sort parks by distance to you, and to power
            in-park features coming soon — like scavenger hunts and other activities you
            can do while you're there.
          </Text>
          <TouchableOpacity
            style={[styles.allowBtn, { backgroundColor: T.primary }]}
            onPress={onAllow}
            activeOpacity={0.85}
          >
            <Text style={[styles.allowText, { color: T.onPrimary }]}>Allow Location Access</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.skip} onPress={onDismiss} hitSlop={10}>
            <Text style={styles.skipText}>Not now</Text>
          </TouchableOpacity>
        </View>
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
    lineHeight: 20, marginBottom: 20,
  },
  allowBtn: {
    alignSelf: 'stretch',
    paddingHorizontal: 22, paddingVertical: 13, borderRadius: 100,
    alignItems: 'center', marginBottom: 10,
  },
  allowText: { fontSize: 14, fontWeight: '800' },
  skip: { paddingHorizontal: 8, paddingVertical: 6 },
  skipText: { fontSize: 13, fontWeight: '600', color: C.inkMute },
});
