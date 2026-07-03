import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';

import { PostCard, type FeedPost } from '@/components/PostCard';

// Universal Link entry point: https://parkquest.me/p/<id> opens here when the
// app is installed. Fetches the post (API enforces visibility) and renders
// the same card used on the feed.

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

const C = {
  bg:      '#F2EBDB',
  ink:     '#1B1A16',
  inkMute: '#7A746A',
  primary: '#1F3D2E',
};

export default function SharedPostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getToken } = useAuth();
  const { user: me } = useUser();
  const router = useRouter();

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
          headerStyle: { backgroundColor: C.bg },
          headerTintColor: C.primary,
          headerShadowVisible: false,
        }}
      />
      {failed ? (
        <View style={styles.center}>
          <Text style={styles.title}>Post not found</Text>
          <Text style={styles.body}>It may have been deleted, or it isn't visible to you.</Text>
          <Text style={styles.link} onPress={() => router.replace('/(tabs)/feed' as never)}>
            Go to feed
          </Text>
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
          />
        </ScrollView>
      ) : (
        <View style={styles.center}>
          <ActivityIndicator color={C.primary} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 8,
  },
  title: { fontSize: 17, fontWeight: '700', color: C.ink },
  body:  { fontSize: 13.5, color: C.inkMute, textAlign: 'center' },
  link:  { fontSize: 14, fontWeight: '700', color: C.primary, marginTop: 8, padding: 8 },
});
