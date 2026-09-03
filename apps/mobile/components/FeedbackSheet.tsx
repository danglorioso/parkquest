import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, Modal, ActivityIndicator,
  StyleSheet, Pressable, KeyboardAvoidingView, Platform, Animated, ScrollView,
} from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { submitFeedback } from '@/lib/api';
import { STATIC as C, useColors } from '@/lib/palette';
import type { FeedbackCategory } from '@parkquest/types';

const MESSAGE_PLACEHOLDER: Record<FeedbackCategory, string> = {
  bug: 'Steps to reproduce, what you expected, what happened instead...',
  suggestion: 'What would you like to see added or changed?',
  question: "What's your question?",
  other: 'Your comments...',
};

const CATEGORIES: { key: FeedbackCategory; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { key: 'bug', label: 'Bug report', icon: 'bug-outline' },
  { key: 'suggestion', label: 'Suggestion', icon: 'bulb-outline' },
  { key: 'question', label: 'Question', icon: 'help-circle-outline' },
  { key: 'other', label: 'Other', icon: 'chatbox-ellipses-outline' },
];

type TokenGetter = () => Promise<string | null>;

// Clerk's getToken identity is unstable every render — never put it in a dep
// array (see root CLAUDE.md). Same idiom as PostCard.tsx's ReportSheet.
function useFreshToken(): TokenGetter {
  const { getToken } = useAuth();
  const ref = useRef(getToken);
  ref.current = getToken;
  return useCallback(() => ref.current(), []);
}

export function FeedbackSheet({ onClose }: { onClose: () => void }) {
  const C_ = useColors();
  const freshToken = useFreshToken();
  const [category, setCategory] = useState<FeedbackCategory | null>(null);
  const [page, setPage] = useState('');
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const slide = useRef(new Animated.Value(500)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slide, { toValue: 0, duration: 260, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
    ]).start();
  }, [slide, backdropOpacity]);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(slide, { toValue: 500, duration: 200, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  const submit = async () => {
    if (!category || !message.trim() || submitting) return;
    setSubmitting(true);
    try {
      const token = await freshToken();
      if (!token) throw new Error('Not signed in');
      await submitFeedback(token, {
        category,
        page: page.trim() || undefined,
        message: message.trim(),
        contactName: name.trim() || undefined,
        contactEmail: email.trim() || undefined,
      });
      setSent(true);
      setTimeout(dismiss, 1100);
    } catch {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible transparent animationType="none" onRequestClose={dismiss} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.sheetBackdrop, { opacity: backdropOpacity }]}
          pointerEvents="none"
        />
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY: slide }] }]}>
          <View style={styles.sheetHandle} />

          {sent ? (
            <View style={styles.sentWrap}>
              <Ionicons name="checkmark-circle" size={40} color={C_.primary} />
              <Text style={styles.sentText}>Thanks for the feedback!</Text>
            </View>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.sheetTitle}>SEND FEEDBACK</Text>

              <View style={styles.categoryRow}>
                {CATEGORIES.map(c => (
                  <TouchableOpacity
                    key={c.key}
                    style={[styles.categoryChip, category === c.key && { backgroundColor: C_.primary, borderColor: C_.primary }]}
                    activeOpacity={0.7}
                    onPress={() => setCategory(c.key)}
                  >
                    <Ionicons name={c.icon} size={14} color={category === c.key ? '#FFFBF1' : C_.inkMute} />
                    <Text style={[styles.categoryChipText, category === c.key && { color: '#FFFBF1' }]}>{c.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput
                value={page}
                onChangeText={t => setPage(t.slice(0, 100))}
                placeholder="Where in the app? (optional)"
                placeholderTextColor={C_.inkMute}
                style={[styles.input, styles.pageInput]}
              />

              <TextInput
                value={message}
                onChangeText={t => setMessage(t.slice(0, 4000))}
                placeholder={category ? MESSAGE_PLACEHOLDER[category] : 'Your comments...'}
                placeholderTextColor={C_.inkMute}
                style={styles.messageInput}
                multiline
              />

              <Text style={styles.contactLabel}>CONTACT INFO (OPTIONAL)</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Name"
                placeholderTextColor={C_.inkMute}
                style={styles.input}
              />
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Email"
                placeholderTextColor={C_.inkMute}
                style={styles.input}
                autoCapitalize="none"
                keyboardType="email-address"
              />

              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: category && message.trim() ? C_.primary : C.hairline }]}
                disabled={!category || !message.trim() || submitting}
                onPress={submit}
              >
                {submitting
                  ? <ActivityIndicator size="small" color="#FFFBF1" />
                  : <Text style={styles.submitText}>Send</Text>}
              </TouchableOpacity>
            </ScrollView>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 18, borderTopRightRadius: 18,
    paddingTop: 8, paddingBottom: 34, maxHeight: '85%',
  },
  sheetHandle: {
    alignSelf: 'center', width: 36, height: 4, borderRadius: 2,
    backgroundColor: C.hairline, marginBottom: 10,
  },
  sheetTitle: {
    textAlign: 'center', fontSize: 13, fontWeight: '700',
    color: C.inkMute, letterSpacing: 1.2,
    paddingBottom: 14, borderBottomWidth: 0.5, borderBottomColor: C.hairlineSoft,
  },
  categoryRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingHorizontal: 18, paddingTop: 14,
  },
  categoryChip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    width: '48%', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12,
    borderWidth: 1, borderColor: C.hairline,
  },
  categoryChipText: { fontSize: 13, fontWeight: '600', color: C.ink },
  input: {
    marginHorizontal: 18, marginTop: 10,
    fontSize: 14, color: C.ink,
    backgroundColor: C.hairlineSoft, borderRadius: 10, padding: 12,
  },
  pageInput: {
    marginTop: 20,
  },
  messageInput: {
    marginHorizontal: 18, marginTop: 10, minHeight: 90,
    fontSize: 14, color: C.ink, textAlignVertical: 'top',
    backgroundColor: C.hairlineSoft, borderRadius: 10, padding: 12,
  },
  contactLabel: {
    marginHorizontal: 18, marginTop: 20,
    fontSize: 11, fontWeight: '700', letterSpacing: 1,
    color: C.inkMute,
  },
  submitBtn: {
    marginHorizontal: 18, marginTop: 18, marginBottom: 4,
    borderRadius: 12, paddingVertical: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  submitText: { fontSize: 14, fontWeight: '700', color: '#FFFBF1' },
  sentWrap: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 40, gap: 10,
  },
  sentText: { fontSize: 15, fontWeight: '600', color: C.ink },
});
