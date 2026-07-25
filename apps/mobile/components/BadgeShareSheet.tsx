import { useEffect, useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { STATIC as C, useColors } from '@/lib/palette';
import { badgeTheme, type BadgeColorPair } from '@/components/BadgeDetailModal';

// Share-to-feed sheet for an earned badge — matches web BadgeShareModal.
// Shared by the badges screen and the profile preview row so both open the
// exact same popup.

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

const AUDIENCE_OPTS = [
  { value: 'friends', label: 'Friends', icon: 'people-outline' },
  { value: 'public',  label: 'Public',  icon: 'globe-outline'  },
  { value: 'private', label: 'Only me', icon: 'lock-closed-outline' },
] as const;
type Audience = typeof AUDIENCE_OPTS[number]['value'];

export interface ShareableBadge {
  id: string;
  name: string;
  description?: string | null;
  emoji: string;
  tier: string;
  colors?: BadgeColorPair | null;
}

export function BadgeShareSheet({ badge, onClose }: { badge: ShareableBadge; onClose: () => void }) {
  const { getToken, userId } = useAuth();
  const T = useColors();
  const [caption, setCaption]             = useState('');
  const [audience, setAudience]           = useState<Audience>('friends');
  const [submitting, setSubmitting]       = useState(false);
  const [alreadyShared, setAlreadyShared] = useState(false);
  const t = badgeTheme(badge.tier, badge.colors);

  // One-time share: check if this badge was already posted
  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const tok = await getToken();
        if (!tok) return;
        const res = await fetch(
          `${BASE}/api/posts?userId=${userId}&badgeId=${encodeURIComponent(badge.id)}&limit=1`,
          { headers: { Authorization: `Bearer ${tok}` } }
        );
        if (res.ok) {
          const rows = await res.json();
          if (Array.isArray(rows) && rows.length > 0) setAlreadyShared(true);
        }
      } catch {}
    })();
    // getToken intentionally omitted — unstable identity re-runs this every render
  }, [userId, badge.id]);

  const handleShare = async () => {
    setSubmitting(true);
    try {
      const tok = await getToken();
      if (!tok) return;
      const res = await fetch(`${BASE}/api/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({
          badge_id: badge.id,
          caption: caption.trim() || null,
          visibility: audience,
          photos: [],
        }),
      });
      if (res.status === 409) { setAlreadyShared(true); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onClose();
      Alert.alert(`${badge.emoji} Badge shared to feed`);
    } catch {
      Alert.alert('Something went wrong', 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.shareOverlay}
      >
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.shareModal}>
          {/* Header */}
          <View style={styles.shareHeader}>
            <Text style={styles.shareTitle}>Share badge</Text>
          </View>

          {/* Badge preview */}
          <View style={[styles.sharePreview, { borderColor: t.fill + '44', backgroundColor: t.fill + '18' }]}>
            <View style={[styles.sharePreviewPatch, { backgroundColor: t.fill }]}>
              <View style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 32,
                borderRadius: 26, backgroundColor: t.light, opacity: 0.4,
              }} />
              <Text style={{ fontSize: 24 }}>{badge.emoji}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sharePreviewKicker, { color: t.fill }]}>
                BADGE EARNED · {t.name.toUpperCase()}
              </Text>
              <Text style={styles.sharePreviewName}>{badge.name}</Text>
              {badge.description ? (
                <Text style={styles.sharePreviewDesc} numberOfLines={2}>{badge.description}</Text>
              ) : null}
            </View>
          </View>

          {/* Visibility picker */}
          <View style={styles.audienceRow}>
            {AUDIENCE_OPTS.map(opt => {
              const active = audience === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => setAudience(opt.value)}
                  activeOpacity={0.7}
                  style={[styles.audiencePill, active && { borderWidth: 1.5, borderColor: T.primary, backgroundColor: `${T.primary}17` }]}
                >
                  <Ionicons name={opt.icon} size={13} color={active ? T.primary : C.inkMute} />
                  <Text style={[styles.audienceLabel, active && { color: T.primary }]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Caption */}
          <TextInput
            value={caption}
            onChangeText={txt => setCaption(txt.slice(0, 500))}
            placeholder="Add a note… (optional)"
            placeholderTextColor={C.inkMute}
            multiline
            style={styles.captionInput}
          />
          <Text style={styles.captionCount}>{caption.length} / 500</Text>

          {/* Action buttons — bottom right */}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <TouchableOpacity onPress={onClose} style={styles.shareCancelBtn} activeOpacity={0.7}>
              <Text style={styles.shareCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleShare}
              disabled={submitting || alreadyShared}
              activeOpacity={0.8}
              style={[
                styles.shareBtn,
                { backgroundColor: T.primary },
                alreadyShared && styles.shareBtnDisabled,
                submitting && { opacity: 0.55 },
              ]}
            >
              {!alreadyShared && <Ionicons name="checkmark" size={13} color={C.onPrimary} />}
              <Text style={[styles.shareBtnText, alreadyShared && { color: C.inkMute }]}>
                {alreadyShared ? 'Already shared' : 'Share'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  shareOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  shareModal: {
    width: '100%', maxWidth: 440,
    backgroundColor: C.surface, borderRadius: 18,
    borderWidth: 0.5, borderColor: C.hairline,
    overflow: 'hidden', paddingBottom: 18,
  },
  shareHeader: {
    paddingHorizontal: 18, paddingVertical: 14,
    borderBottomWidth: 0.5, borderBottomColor: C.hairlineSoft,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  shareTitle: {
    fontSize: 13, fontWeight: '700', color: C.ink,
  },
  shareCancelBtn: {
    borderWidth: 0.5, borderColor: C.hairline, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  shareCancelText: {
    fontSize: 13, fontWeight: '700', color: C.ink,
  },
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 5,
  },
  shareBtnDisabled: {
    backgroundColor: C.surfaceAlt,
    borderWidth: 0.5, borderColor: C.hairline,
  },
  shareBtnText: {
    fontSize: 13, fontWeight: '700', color: C.onPrimary,
  },
  sharePreview: {
    marginHorizontal: 18, marginTop: 16,
    padding: 14, paddingHorizontal: 16,
    borderRadius: 12, borderWidth: 0.5,
    flexDirection: 'row', alignItems: 'center', gap: 14,
  },
  sharePreviewPatch: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  sharePreviewKicker: {
    fontSize: 13, fontWeight: '700', letterSpacing: 1.4, marginBottom: 2,
  },
  sharePreviewName: {
    fontSize: 16, fontWeight: '800', color: C.ink, letterSpacing: -0.3,
  },
  sharePreviewDesc: {
    fontSize: 13, color: C.inkMute, marginTop: 2,
  },
  audienceRow: {
    flexDirection: 'row', gap: 6,
    paddingHorizontal: 18, paddingTop: 14,
  },
  audiencePill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 7, borderRadius: 8,
    borderWidth: 0.5, borderColor: C.hairline,
  },
  audienceLabel: {
    fontSize: 13, fontWeight: '700', color: C.inkMute,
  },
  captionInput: {
    marginHorizontal: 18, marginTop: 12,
    minHeight: 80, maxHeight: 160,
    backgroundColor: C.bg, borderWidth: 0.5, borderColor: C.hairline,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: C.ink, lineHeight: 21,
    textAlignVertical: 'top',
  },
  captionCount: {
    fontSize: 13, fontWeight: '600', color: C.inkMute, letterSpacing: 0.5,
    textAlign: 'right', marginHorizontal: 18, marginTop: 6,
  },
});
