import { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BADGE_MAP, badgeColors, ensureBadgeDefs, type BadgeColors } from '@/lib/badges';
import { STATIC as C } from '@/lib/palette';

// Light badge detail modal — emoji, tier, how-to-earn, earned date.
// Used from the profile screen and other users' profiles; the badges screen
// has its own richer dark/animated variant.

export interface BadgeModalData {
  id: string;
  name: string;
  emoji: string;
  tier: string;
  colors?: BadgeColors | null;
  earned_at: string | null;
}

export function BadgeInfoModal({ badge, onClose }: { badge: BadgeModalData; onClose: () => void }) {
  const [def, setDef] = useState(() => BADGE_MAP.get(badge.id));

  // Static defs never carry admin edits (custom colors, renames), so always
  // refresh from the server defs and re-read.
  useEffect(() => {
    let active = true;
    ensureBadgeDefs().then(() => { if (active) setDef(BADGE_MAP.get(badge.id)); });
    return () => { active = false; };
  }, [badge.id]);
  const tint = badgeColors({ tier: badge.tier, colors: badge.colors ?? def?.colors }).fill;
  const earnedDate = badge.earned_at
    ? new Date(badge.earned_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={s.modal}>
          <TouchableOpacity onPress={onClose} style={s.close}>
            <Ionicons name="close" size={16} color={C.inkMute} />
          </TouchableOpacity>

          <View style={[s.emoji, { backgroundColor: tint + '14', borderColor: tint + '44' }]}>
            <Text style={{ fontSize: 36 }}>{badge.emoji}</Text>
          </View>
          <Text style={s.name}>{badge.name}</Text>
          <Text style={[s.tier, { color: tint }]}>{badge.tier}</Text>

          {def ? (
            <View style={s.how}>
              <Text style={s.howKicker}>HOW TO EARN</Text>
              <Text style={s.howText}>{def.description}</Text>
            </View>
          ) : null}

          {earnedDate ? (
            <Text style={s.earned}>
              Earned on <Text style={{ fontWeight: '700', color: C.inkSoft }}>{earnedDate}</Text>
            </Text>
          ) : (
            <Text style={[s.earned, { fontStyle: 'italic' }]}>Not yet earned</Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  modal: {
    backgroundColor: C.bg, borderRadius: 18,
    borderWidth: 0.5, borderColor: C.hairline,
    paddingVertical: 32, paddingHorizontal: 28,
    width: '100%', maxWidth: 360, alignItems: 'center',
  },
  close: {
    position: 'absolute', top: 14, right: 14, zIndex: 10, padding: 4,
  },
  emoji: {
    width: 72, height: 72, borderRadius: 20, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  name: {
    fontSize: 20, fontWeight: '800', color: C.ink,
    letterSpacing: -0.3, textAlign: 'center',
  },
  tier: {
    fontSize: 13, fontWeight: '700', letterSpacing: 1.6,
    textTransform: 'uppercase', marginTop: 5, marginBottom: 20,
  },
  how: {
    backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.hairline,
    borderRadius: 10, paddingVertical: 14, paddingHorizontal: 16,
    marginBottom: 16, alignSelf: 'stretch',
  },
  howKicker: {
    fontSize: 13, fontWeight: '600', letterSpacing: 1.2,
    color: C.inkMute, marginBottom: 6,
  },
  howText: {
    fontSize: 13.5, color: C.inkSoft, lineHeight: 21,
  },
  earned: {
    fontSize: 13, color: C.inkMute, textAlign: 'center',
  },
});
