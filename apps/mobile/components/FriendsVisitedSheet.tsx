import { useEffect, useRef } from 'react';
import {
  Animated, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/components/Avatar';
import { STATIC as C, useColors } from '@/lib/palette';
import type { ParkVisitorsSummary } from '@/lib/api';

// Tap-through list for the "N friends have visited" mutuals row — same slide-up
// sheet pattern as PostCard's LikersSheet ("Liked by").
export function FriendsVisitedSheet({
  friends, onClose,
}: { friends: ParkVisitorsSummary['friends']; onClose: () => void }) {
  const router = useRouter();
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

  const openProfile = (userId: string) => {
    dismiss();
    router.push(`/user/${userId}` as never);
  };

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
          <View style={styles.handle} />
          <Text style={styles.title}>FRIENDS WHO VISITED</Text>
          {friends.length === 0 ? (
            <Text style={styles.empty}>No friends have visited yet</Text>
          ) : (
            <ScrollView style={{ maxHeight: 380 }} bounces={false}>
              {friends.map(f => {
                const name = f.display_name ?? f.username ?? 'Explorer';
                return (
                  <TouchableOpacity
                    key={f.clerk_user_id}
                    style={styles.row}
                    activeOpacity={0.7}
                    onPress={() => openProfile(f.clerk_user_id)}
                  >
                    <Avatar url={f.avatar_url} name={name} size={36} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{name}</Text>
                      {f.username ? <Text style={styles.sub}>@{f.username}</Text> : null}
                    </View>
                    <Ionicons name="chevron-forward" size={14} color={T.inkMute} />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
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
  empty: { textAlign: 'center', fontSize: 13, color: C.inkMute, padding: 24 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 18, paddingVertical: 10,
  },
  name: { fontSize: 14, fontWeight: '600', color: C.ink },
  sub: { fontSize: 13, color: C.inkMute, marginTop: 1 },
});
