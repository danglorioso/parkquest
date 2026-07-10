import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';

import { PostCard, type FeedPost } from '@/components/PostCard';
import { EmptyState } from '@/components/EmptyState';
import { STATIC, useColors } from '@/lib/palette';

// Universal Link entry point: https://parkquest.me/p/<id> opens here when the
// app is installed. Fetches the post (API enforces visibility) and renders
// the same card used on the feed.

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export default function SharedPostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getToken } = useAuth();
  const { user: me } = useUser();
  const router = useRouter();
  const T = useColors();

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

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Post',
          headerStyle: { backgroundColor: STATIC.bg },
          headerTintColor: T.primary,
          headerShadowVisible: false,
        }}
      />
      {failed ? (
        <View style={styles.center}>
          <EmptyState
            icon="newspaper-outline"
            title="Post not found"
            subtitle="It may have been deleted, or it isn't visible to you."
            action={{ label: 'Go to feed', onPress: () => router.replace('/(tabs)/feed' as never) }}
          />
        </View>
      ) : post && token ? (
        <ScrollView contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
          <PostCard
            post={post}
            token={token}
            myUserId={me?.id ?? ''}
            myAvatarUrl={me?.imageUrl}
            myName={me?.fullName ?? me?.username}
            onDelete={() => router.replace('/(tabs)/feed' as never)}
            onParkPress={code => router.push(`/parks/${code}` as never)}
            openOnPress={false}
            autoOpenComments={post.comment_count > 0}
          />
        </ScrollView>
      ) : (
        <View style={styles.center}>
          <ActivityIndicator color={T.primary} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: STATIC.bg },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
