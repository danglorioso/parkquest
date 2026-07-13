import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';

import { PostCard, type FeedPost } from '@/components/PostCard';
import { EmptyState } from '@/components/EmptyState';
import { Wordmark } from '@/components/Wordmark';
import { STATIC, dyn, useColors } from '@/lib/palette';
import { useTabBarSpace } from '@/components/FloatingTabBar';

// Offshoot of the feed tab, so back navigation and the bottom tab bar behave
// like any other feed screen. Also the target for the `/p/<id>` Universal
// Link (see app/p/[id].tsx, which re-exports this screen) and for in-app
// deep links (e.g. notifications) that pass `open=likes` or `open=comments`
// to jump straight to the relevant sheet.

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export default function PostDetailScreen() {
  const { id, open } = useLocalSearchParams<{ id: string; open?: string }>();
  const { getToken } = useAuth();
  const { user: me } = useUser();
  const router = useRouter();
  const T = useColors();
  const insets = useSafeAreaInsets();
  const tabBarSpace = useTabBarSpace();
  const TOP_BAR_H = insets.top + 56.5;

  const [post, setPost] = useState<FeedPost | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!id || isNaN(Number(id))) { setFailed(true); return; }
    const tok = await getToken();
    if (!tok) { setFailed(true); return; }
    setToken(tok);
    try {
      const res = await fetch(`${BASE}/api/posts/${id}`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (!res.ok) { setFailed(true); return; }
      setPost(await res.json());
    } catch {
      setFailed(true);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/feed' as never));

  return (
    <View style={styles.screen}>
      {failed ? (
        <View style={[styles.center, { paddingTop: TOP_BAR_H }]}>
          <EmptyState
            icon="newspaper-outline"
            title="Post not found"
            subtitle="It may have been deleted, or it isn't visible to you."
            action={{ label: 'Go to feed', onPress: () => router.replace('/(tabs)/feed' as never) }}
          />
        </View>
      ) : post && token ? (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingTop: TOP_BAR_H + 12, paddingBottom: tabBarSpace + 16 }}
          showsVerticalScrollIndicator={false}
        >
          <PostCard
            post={post}
            myUserId={me?.id ?? ''}
            myAvatarUrl={me?.imageUrl}
            myName={me?.fullName ?? me?.username}
            onDelete={() => router.replace('/(tabs)/feed' as never)}
            onParkPress={code => router.push(`/parks/${code}` as never)}
            openOnPress={false}
            autoOpenComments={open !== 'likes' && post.comment_count > 0}
            autoOpenLikers={open === 'likes'}
          />
        </ScrollView>
      ) : (
        <View style={[styles.center, { paddingTop: TOP_BAR_H }]}>
          <ActivityIndicator color={T.primary} />
        </View>
      )}

      {/* Floating glass top bar — matches the feed tab's header */}
      <View style={[styles.topBar, { paddingTop: insets.top, height: TOP_BAR_H }]}>
        <View style={styles.topBarInner}>
          <TouchableOpacity onPress={goBack} hitSlop={8} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={24} color={T.primary} />
          </TouchableOpacity>
          <Wordmark />
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.topBarHairline} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: STATIC.bg },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    overflow: 'hidden',
    backgroundColor: dyn('rgba(242,235,219,0.88)', 'rgba(23,21,17,0.88)'),
  },
  topBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  topBarHairline: {
    height: 0.5,
    backgroundColor: STATIC.hairline,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
